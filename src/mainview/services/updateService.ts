import type { UpdateCheckResult, UpdateStatePayload, UpdateProgressEvent, UpdateStatus } from "../../shared/rpcSchema"
import { APP_VERSION } from "../constants"
import { getUpdaterRpc, isSecureStorageAvailable } from "./storage"

/**
 * Isolated update service for the webview.
 * Uses Electrobun's official update mechanism via RPC to the bun process.
 * - At most one automatic check per launch (deduped in bun).
 * - Never blocks app usage; all failures are non-fatal.
 * - Exposes a subscribe interface so banner + settings stay in sync.
 * - Outside Electrobun (vite dev), falls back to a no-op idle state.
 */

type Listener = (state: UpdateStatePayload) => void
type ProgressListener = (event: UpdateProgressEvent) => void

const INITIAL_STATE: UpdateStatePayload = {
	status: "idle",
	currentVersion: APP_VERSION,
	newVersion: null,
	releaseNotes: null,
	error: null,
	progress: null,
	checkedAt: null,
	channel: null,
	updateReady: false,
}

class UpdateService {
	private state: UpdateStatePayload = { ...INITIAL_STATE }
	private listeners = new Set<Listener>()
	private progressListeners = new Set<ProgressListener>()
	private hasAutoChecked = false
	private progressBound = false
	private progressHandler: EventListener | null = null
	private installingPromise: Promise<void> | null = null
	private refreshPromise: Promise<UpdateStatePayload> | null = null

	private ensureProgressListener() {
		if (this.progressBound) return
		this.progressBound = true
		if (typeof window !== "undefined") {
			this.progressHandler = ((e: CustomEvent<UpdateProgressEvent>) => {
				if (e.detail) this.handleProgress(e.detail)
			}) as EventListener
			window.addEventListener("pr5auth:updater-progress", this.progressHandler)
		}
	}

	private getRpc() {
		this.ensureProgressListener()
		if (!isSecureStorageAvailable()) return null
		return getUpdaterRpc()
	}

	private setState(next: Partial<UpdateStatePayload>) {
		this.state = { ...this.state, ...next }
		for (const cb of this.listeners) {
			try {
				cb({ ...this.state })
			} catch {
				// ignore listener errors
			}
		}
	}

	private handleProgress(event: UpdateProgressEvent) {
		const raw = String(event.status)
		let mapped: UpdateStatus | null = null
		let progress: number | null = this.state.progress

		if (typeof event.progress === "number") progress = event.progress
		else if (typeof event.bytesDownloaded === "number" && typeof event.totalBytes === "number" && event.totalBytes > 0) {
			progress = Math.round((event.bytesDownloaded / event.totalBytes) * 100)
		}

		if (["checking", "check-complete", "checking-local-tar"].includes(raw)) {
			mapped = "checking"
		} else if (["downloading", "download-starting", "downloading-patch", "downloading-full-bundle", "download-progress", "fetching-patch", "applying-patch"].includes(raw)) {
			mapped = "downloading"
			if (progress === null) progress = this.state.progress ?? 0
		} else if (["decompressing", "extracting", "replacing-app", "applying", "launching-new-version"].includes(raw) || raw === "installing") {
			mapped = "installing"
		} else if (["no-update"].includes(raw)) {
			mapped = "no-update"
		} else if (["update-available"].includes(raw)) {
			mapped = "update-available"
		} else if (["error", "failed", "patch-failed"].includes(raw)) {
			mapped = "failed"
		} else if (["complete", "download-complete", "patch-chain-complete"].includes(raw)) {
			if (raw === "download-complete" || raw === "patch-chain-complete") {
				mapped = "update-available"
				progress = 100
			} else {
				mapped = "installing"
			}
		}

		if (raw === "download-progress" && typeof progress === "number") {
			mapped = "downloading"
		}

		if (mapped) {
			this.setState({
				status: mapped,
				progress: progress ?? this.state.progress,
				error: event.errorMessage ?? (mapped === "failed" ? event.message : null),
			})
		} else if (progress !== null && progress !== this.state.progress) {
			this.setState({ progress })
		}

		for (const cb of this.progressListeners) {
			try { cb(event) } catch { /* ignore */ }
		}
	}

	getState(): UpdateStatePayload {
		return { ...this.state }
	}

	subscribe(listener: Listener): () => void {
		this.ensureProgressListener()
		this.listeners.add(listener)
		try { listener({ ...this.state }) } catch { /* ignore */ }
		return () => { this.listeners.delete(listener) }
	}

	onProgress(listener: ProgressListener): () => void {
		this.progressListeners.add(listener)
		return () => { this.progressListeners.delete(listener) }
	}

	async checkForUpdates(force = false): Promise<UpdateStatePayload> {
		const rpc = this.getRpc()
		if (!rpc) {
			const idle: UpdateStatePayload = {
				...this.state,
				status: "no-update",
				currentVersion: APP_VERSION,
				channel: "dev",
				checkedAt: Date.now(),
				error: null,
			}
			this.state = idle
			for (const cb of this.listeners) cb({ ...idle })
			return idle
		}
		this.setState({ status: "checking", error: null, progress: null })
		try {
			const result: UpdateCheckResult = await rpc.request["updater:check"]({ force })
			const next: UpdateStatePayload = {
				status: result.status,
				currentVersion: result.currentVersion || APP_VERSION,
				newVersion: result.newVersion,
				releaseNotes: result.releaseNotes,
				error: result.error,
				progress: result.progress,
				checkedAt: result.checkedAt,
				channel: result.channel,
				updateReady: result.updateReady,
			}
			this.state = next
			for (const cb of this.listeners) cb({ ...next })
			return next
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err)
			const failed: UpdateStatePayload = { ...this.state, status: "failed", error: msg, progress: null, checkedAt: Date.now() }
			this.state = failed
			for (const cb of this.listeners) cb({ ...failed })
			return failed
		}
	}

	async checkOnceOnStartup(): Promise<void> {
		if (this.hasAutoChecked) return
		this.hasAutoChecked = true
		await new Promise((r) => setTimeout(r, 1200))
		await this.checkForUpdates(false)
	}

	async downloadUpdate(): Promise<UpdateStatePayload> {
		const rpc = this.getRpc()
		if (!rpc) {
			const failed: UpdateStatePayload = { ...this.state, status: "failed", error: "Updates unavailable outside desktop app." }
			this.state = failed
			for (const cb of this.listeners) cb({ ...failed })
			return failed
		}
		this.setState({ status: "downloading", progress: 0, error: null })
		try {
			const result: UpdateCheckResult = await rpc.request["updater:download"]()
			const next: UpdateStatePayload = {
				status: result.status,
				currentVersion: result.currentVersion,
				newVersion: result.newVersion,
				releaseNotes: result.releaseNotes,
				error: result.error,
				progress: result.progress,
				checkedAt: result.checkedAt,
				channel: result.channel,
				updateReady: result.updateReady,
			}
			this.state = next
			for (const cb of this.listeners) cb({ ...next })
			return next
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err)
			const failed: UpdateStatePayload = { ...this.state, status: "failed", error: msg, progress: null }
			this.state = failed
			for (const cb of this.listeners) cb({ ...failed })
			return failed
		}
	}

	async installUpdate(): Promise<void> {
		if (this.installingPromise) return this.installingPromise
		const rpc = this.getRpc()
		if (!rpc) {
			const failed: UpdateStatePayload = { ...this.state, status: "failed", error: "Updates unavailable outside desktop app." }
			this.state = failed
			for (const cb of this.listeners) cb({ ...failed })
			return
		}
		this.setState({ status: "installing", error: null })
		this.installingPromise = (async () => {
			try {
				await rpc.request["updater:apply"]()
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err)
				const failed: UpdateStatePayload = { ...this.state, status: "failed", error: msg }
				this.state = failed
				for (const cb of this.listeners) cb({ ...failed })
			}
		})()
		try {
			return await this.installingPromise
		} finally {
			this.installingPromise = null
		}
	}

	async refreshState(): Promise<UpdateStatePayload> {
		if (this.refreshPromise) return this.refreshPromise
		const rpc = this.getRpc()
		if (!rpc) return { ...this.state }
		this.refreshPromise = (async () => {
			try {
				const s: UpdateStatePayload = await rpc.request["updater:getState"]()
				if (s.checkedAt && (!this.state.checkedAt || s.checkedAt >= this.state.checkedAt)) {
					this.state = { ...this.state, ...s }
					for (const cb of this.listeners) cb({ ...this.state })
				}
				return { ...this.state }
			} catch {
				return { ...this.state }
			} finally {
				this.refreshPromise = null
			}
		})()
		return this.refreshPromise
	}

	resetForTests() {
		if (this.progressHandler && typeof window !== "undefined") {
			try {
				window.removeEventListener("pr5auth:updater-progress", this.progressHandler)
			} catch {
				// ignore
			}
		}
		this.progressHandler = null
		this.installingPromise = null
		this.refreshPromise = null
		this.state = { ...INITIAL_STATE }
		this.hasAutoChecked = false
		this.listeners.clear()
		this.progressListeners.clear()
		this.progressBound = false
	}
}

export const updateService = new UpdateService()

export function getUpdateState(): UpdateStatePayload {
	return updateService.getState()
}
