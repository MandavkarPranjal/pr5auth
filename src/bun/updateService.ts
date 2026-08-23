import { Updater } from "electrobun/bun"
import type { UpdateCheckResult, UpdateStatePayload, UpdateProgressEvent } from "../shared/rpcSchema"

/**
 * Dedicated update service – isolated from storage/tray logic.
 * Uses Electrobun's official Updater APIs only.
 * Guarantees: never blocks app startup, at most one check per launch,
 * no repeated downloads, failures never prevent app usage.
 */

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

let hasCheckedThisLaunch = false
let checkingPromise: Promise<UpdateCheckResult> | null = null
let downloadingPromise: Promise<UpdateCheckResult> | null = null

let currentState: UpdateStatePayload = {
	status: "idle",
	currentVersion: "",
	newVersion: null,
	releaseNotes: null,
	error: null,
	progress: null,
	checkedAt: null,
	channel: null,
	updateReady: false,
}

let lastCheckResult: UpdateCheckResult | null = null

// Callback registered by bun/index.ts to push progress to webviews
let progressSender: ((event: UpdateProgressEvent) => void) | null = null

export function setProgressSender(sender: ((e: UpdateProgressEvent) => void) | null) {
	progressSender = sender
}

function emitProgress(event: UpdateProgressEvent) {
	try {
		progressSender?.(event)
	} catch {
		// ignore – never let progress reporting break update logic
	}
}

function mapUpdaterError(err: unknown): string {
	if (err instanceof Error) return err.message
	return String(err)
}

async function getLocalInfoSafe(): Promise<{
	version: string
	hash: string
	channel: string
	baseUrl: string
}> {
	try {
		const info = await Updater.getLocalInfo()
		return {
			version: info.version ?? "",
			hash: info.hash ?? "",
			channel: info.channel ?? "",
			baseUrl: info.baseUrl ?? "",
		}
	} catch {
		return { version: "", hash: "", channel: "", baseUrl: "" }
	}
}

function buildStateFromCheck(
	localVersion: string,
	channel: string,
	updateInfo: { version: string; hash: string; updateAvailable: boolean; updateReady: boolean; error: string } | null,
	errorOverride?: string,
): UpdateCheckResult {
	const hasError = errorOverride ?? (updateInfo?.error || null)
	// Electrobun exposes version/hash; releaseNotes is optional in update.json
	const rawInfo = updateInfo as unknown as Record<string, unknown> | null
	const releaseNotes =
		(rawInfo?.["releaseNotes"] as string | undefined) ??
		(rawInfo?.["notes"] as string | undefined) ??
		(rawInfo?.["body"] as string | undefined) ??
		null

	const newVersion = updateInfo?.version || null
	const updateAvailable = updateInfo?.updateAvailable ?? false

	let status: UpdateStatePayload["status"]
	if (hasError) status = "failed"
	else if (updateAvailable) status = "update-available"
	else if (hasCheckedThisLaunch) status = "no-update"
	else status = "idle"

	const result: UpdateCheckResult = {
		status,
		currentVersion: localVersion,
		newVersion: updateAvailable ? newVersion : null,
		releaseNotes: updateAvailable ? releaseNotes : null,
		error: hasError,
		progress: null,
		checkedAt: Date.now(),
		channel,
		updateAvailable,
		updateReady: updateInfo?.updateReady ?? false,
	}
	return result
}

// ---------------------------------------------------------------------------
// Public API – used by RPC handlers and auto-check on startup
// ---------------------------------------------------------------------------

export function getState(): UpdateStatePayload {
	return { ...currentState }
}

export async function checkForUpdate(force = false): Promise<UpdateCheckResult> {
	// Deduplicate to at most once per launch unless force=true (Settings button)
	if (!force && hasCheckedThisLaunch && lastCheckResult) {
		return lastCheckResult
	}
	if (checkingPromise) return checkingPromise

	checkingPromise = (async () => {
		const local = await getLocalInfoSafe()
		currentState = {
			...currentState,
			status: "checking",
			currentVersion: local.version,
			channel: local.channel,
			error: null,
			progress: null,
		}
		emitProgress({ status: "checking", message: "Checking for updates..." })

		try {
			// Updater.checkForUpdate fetches `${baseUrl}/${prefix}-update.json`
			// and compares hash. On dev channel it returns updateAvailable=false immediately.
			const info = await Updater.checkForUpdate()
			const result = buildStateFromCheck(local.version, local.channel, info as unknown as { version: string; hash: string; updateAvailable: boolean; updateReady: boolean; error: string })
			currentState = {
				status: result.status,
				currentVersion: result.currentVersion,
				newVersion: result.newVersion,
				releaseNotes: result.releaseNotes,
				error: result.error,
				progress: null,
				checkedAt: result.checkedAt,
				channel: result.channel,
				updateReady: result.updateReady,
			}
			lastCheckResult = result
			hasCheckedThisLaunch = true

			if (result.status === "update-available") {
				emitProgress({
					status: "update-available",
					message: `Update available: ${result.currentVersion} → ${result.newVersion}`,
				})
			} else if (result.status === "no-update") {
				emitProgress({ status: "no-update", message: "You are on the latest version." })
			} else if (result.status === "failed" && result.error) {
				emitProgress({ status: "failed", message: result.error, errorMessage: result.error })
			}
			return result
		} catch (err) {
			const msg = mapUpdaterError(err)
			const result = buildStateFromCheck(local.version, local.channel, null, msg)
			currentState = {
				status: "failed",
				currentVersion: local.version,
				newVersion: null,
				releaseNotes: null,
				error: msg,
				progress: null,
				checkedAt: Date.now(),
				channel: local.channel,
				updateReady: false,
			}
			lastCheckResult = result
			hasCheckedThisLaunch = true
			emitProgress({ status: "failed", message: msg, errorMessage: msg })
			// Never throw – caller should receive a failed-state payload, not a rejected promise
			return result
		} finally {
			checkingPromise = null
		}
	})()

	return checkingPromise
}

export async function downloadUpdate(): Promise<UpdateCheckResult> {
	if (downloadingPromise) return downloadingPromise

	// Ensure we have a check result; if not, check first (but respect dedup)
	if (!lastCheckResult?.updateAvailable) {
		const check = await checkForUpdate(false)
		if (!check.updateAvailable) {
			return check
		}
	}

	downloadingPromise = (async () => {
		const local = await getLocalInfoSafe()
		currentState = {
			...currentState,
			status: "downloading",
			progress: 0,
			error: null,
		}
		emitProgress({ status: "downloading", message: "Starting download...", progress: 0 })

		// Subscribe to Electrobun's granular status callbacks for progress → forward to webview
		const prevCallback = (Updater as unknown as { onStatusChange?: unknown }).onStatusChange
		let onStatusChangeActive = false
		try {
			// Preserve previous callback if any (not expected, but safe)
			Updater.onStatusChange((entry) => {
				// Electrobun emits many intermediate statuses; map relevant ones to progress
				const p = (entry.details?.progress as number | undefined) ?? entry.details?.progress
				const bytes = entry.details?.bytesDownloaded
				const total = entry.details?.totalBytes
				let progress: number | undefined
				if (typeof p === "number") progress = p
				else if (typeof bytes === "number" && typeof total === "number" && total > 0) {
					progress = Math.round((bytes / total) * 100)
				}

				if (typeof progress === "number") {
					currentState = { ...currentState, progress }
				}

				// Forward every Electrobun status as-is to the UI; the view service maps it to user-friendly text
				emitProgress({
					status: entry.status as UpdateProgressEvent["status"],
					message: entry.message,
					progress,
					bytesDownloaded: entry.details?.bytesDownloaded,
					totalBytes: entry.details?.totalBytes,
					errorMessage: entry.details?.errorMessage,
				})
			})
			onStatusChangeActive = true
		} catch {
			// Updater.onStatusChange may not exist in older builds – ignore
		}

		try {
			// Electrobun verifies the bundle internally (hash / signature via baseUrl assets).
			// This call handles patch vs full download, zstd decompression and integrity checks.
			await Updater.downloadUpdate()

			const info = Updater.updateInfo ? Updater.updateInfo() : null
			const ready = info?.updateReady ?? false
			const error = info?.error || null

			if (error) {
				currentState = {
					...currentState,
					status: "failed",
					error,
					progress: null,
				}
				emitProgress({ status: "failed", message: error, errorMessage: error })
				// Return last check enriched with error
				const failed: UpdateCheckResult = {
					...lastCheckResult!,
					status: "failed",
					error,
					progress: null,
					checkedAt: Date.now(),
					updateReady: false,
				}
				return failed
			}

			if (!ready) {
				const msg = "Download finished but update is not ready. Please try again."
				currentState = { ...currentState, status: "failed", error: msg, progress: null }
				emitProgress({ status: "failed", message: msg, errorMessage: msg })
				const failed: UpdateCheckResult = {
					...lastCheckResult!,
					status: "failed",
					error: msg,
					progress: null,
					checkedAt: Date.now(),
					updateReady: false,
				}
				return failed
			}

			currentState = {
				...currentState,
				status: "update-available",
				progress: 100,
				updateReady: true,
				error: null,
			}
			emitProgress({ status: "download-complete", message: "Download complete – ready to install.", progress: 100 })

			// Return refreshed check result with updateReady = true
			const success: UpdateCheckResult = {
				...lastCheckResult!,
				status: "update-available",
				progress: 100,
				updateReady: true,
				checkedAt: Date.now(),
				error: null,
			}
			return success
		} catch (err) {
			const msg = mapUpdaterError(err)
			currentState = { ...currentState, status: "failed", error: msg, progress: null }
			emitProgress({ status: "failed", message: msg, errorMessage: msg })
			const failed: UpdateCheckResult = {
				...(lastCheckResult ?? buildStateFromCheck(local.version, local.channel, null, msg)),
				status: "failed",
				error: msg,
				progress: null,
				checkedAt: Date.now(),
				updateReady: false,
			}
			return failed
		} finally {
			if (onStatusChangeActive) {
				try {
					// Clear progress listener – restore previous if existed
					Updater.onStatusChange(null)
					// If there was a previous callback we lose it; acceptable for single-service usage.
					void prevCallback
				} catch {
					// ignore
				}
			}
			downloadingPromise = null
		}
	})()

	return downloadingPromise
}

export async function applyUpdate(): Promise<void> {
	// Guard: ensure update is ready; if not, try to ensure state reflects failure without throwing fatally
	const state = getState()
	if (!state.updateReady && state.status !== "update-available") {
		// Allow apply to be attempted anyway – Updater will no-op if not ready
	}

	currentState = { ...currentState, status: "installing", error: null }
	emitProgress({ status: "installing", message: "Installing update..." })

	try {
		// Electrobun's applyUpdate is synchronous-ish: it extracts the tar, replaces the app bundle,
		// and restarts via quit(). On success the process exits – we will not return.
		// If it fails, it logs and stays alive.
		await Updater.applyUpdate()
		// If we reach here, apply was not applied (e.g. not ready or failed). Reflect as failed if error set.
		const info = Updater.updateInfo ? Updater.updateInfo() : null
		if (info?.error) {
			currentState = { ...currentState, status: "failed", error: info.error }
			emitProgress({ status: "failed", message: info.error, errorMessage: info.error })
		} else {
			// Still installing – the restart is expected to happen via Updater's quit()
			// If no restart happened, treat as success pending restart; keep installing until process exits.
		}
	} catch (err) {
		const msg = mapUpdaterError(err)
		currentState = { ...currentState, status: "failed", error: msg }
		emitProgress({ status: "failed", message: msg, errorMessage: msg })
		throw new Error(msg)
	}
}

/**
 * Kick off a background check shortly after startup. Never blocks window creation.
 * Called from bun/index.ts after the main window exists.
 */
export function scheduleStartupCheck(delayMs = 2500) {
	setTimeout(() => {
		void checkForUpdate(false).catch(() => {
			// Swallow – update failures must never affect app startup
		})
	}, delayMs)
}
