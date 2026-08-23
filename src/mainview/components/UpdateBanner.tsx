import { useEffect, useState } from "react"
import { Download, RefreshCw, X, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react"
import type { UpdateStatePayload } from "../../shared/rpcSchema"
import { updateService } from "../services/updateService"

interface UpdateBannerProps {
	onNavigateToSettings?: () => void
}

export function UpdateBanner({ onNavigateToSettings }: UpdateBannerProps) {
	const [state, setState] = useState<UpdateStatePayload>(() => updateService.getState())
	const [dismissed, setDismissed] = useState(false)
	const [actionBusy, setActionBusy] = useState(false)

	useEffect(() => {
		const unsub = updateService.subscribe(setState)
		return unsub
	}, [])

	// Reset dismissal when a new update becomes available
	useEffect(() => {
		if (state.status === "update-available") setDismissed(false)
	}, [state.status, state.newVersion])

	if (dismissed) return null

	// Only show non-intrusively when update is available, downloading, installing, or failed
	// Do not show for idle/checking/no-update – Settings handles those
	if (state.status !== "update-available" && state.status !== "downloading" && state.status !== "installing" && state.status !== "failed") {
		return null
	}

	// Failed is shown as a small non-blocking notice, not a modal
	const isAvailable = state.status === "update-available"
	const isDownloading = state.status === "downloading"
	const isInstalling = state.status === "installing"
	const isFailed = state.status === "failed"

	async function handleUpdate() {
		if (actionBusy) return
		setActionBusy(true)
		try {
			// First download; if already ready, download will return quickly with updateReady=true
			const dl = await updateService.downloadUpdate()
			if (dl.status === "failed") return
			// If download succeeded and update is ready, install
			if (dl.updateReady || dl.status === "update-available") {
				await updateService.installUpdate()
			}
		} finally {
			setActionBusy(false)
		}
	}

	function handleLater() {
		setDismissed(true)
	}

	function handleDismissFailed() {
		setDismissed(true)
	}

	return (
		<div
			role="status"
			aria-live="polite"
			className="pointer-events-auto mx-auto max-w-3xl"
		>
			<div
				className={`flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur-xl ${
					isFailed
						? "border-amber-500/20 bg-amber-500/10"
						: isDownloading || isInstalling
							? "border-sky-500/20 bg-sky-500/10"
							: "border-emerald-500/20 bg-emerald-500/10"
				}`}
			>
				<div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isFailed ? "bg-amber-500/20" : "bg-emerald-500/20"}`}>
					{isDownloading ? (
						<Loader2 className="h-4 w-4 animate-spin text-sky-300" />
					) : isInstalling ? (
						<Loader2 className="h-4 w-4 animate-spin text-sky-300" />
					) : isFailed ? (
						<AlertTriangle className="h-4 w-4 text-amber-300" />
					) : (
						<Download className="h-4 w-4 text-emerald-300" />
					)}
				</div>

				<div className="min-w-0 flex-1">
					{isAvailable && (
						<>
							<p className="text-sm font-semibold text-white">
								Update available
								<span className="ml-2 font-mono text-xs font-normal text-slate-400">
									{state.currentVersion} → {state.newVersion}
								</span>
							</p>
							{state.releaseNotes ? (
								<p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-300">{state.releaseNotes}</p>
							) : (
								<p className="mt-1 text-xs text-slate-400">A new version of PR5Auth is ready to install.</p>
							)}
							{state.updateReady && (
								<p className="mt-1 flex items-center gap-1 text-xs text-emerald-300">
									<CheckCircle2 className="h-3 w-3" /> Ready to install – restart to apply.
								</p>
							)}
						</>
					)}

					{isDownloading && (
						<>
							<p className="text-sm font-semibold text-white">Downloading update…</p>
							<p className="mt-1 text-xs text-slate-300">
								{state.currentVersion} → {state.newVersion ?? "latest"}
								{typeof state.progress === "number" ? ` · ${state.progress}%` : ""}
							</p>
							<div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
								<div
									className="h-full bg-sky-400 transition-all duration-300"
									style={{ width: `${Math.max(2, Math.min(100, state.progress ?? 0))}%` }}
								/>
							</div>
							<p className="mt-1 text-[11px] text-slate-400">Verified by Electrobun’s built-in security mechanism.</p>
						</>
					)}

					{isInstalling && (
						<>
							<p className="text-sm font-semibold text-white">Installing update…</p>
							<p className="mt-1 text-xs text-slate-300">PR5Auth will restart automatically when ready.</p>
						</>
					)}

					{isFailed && (
						<>
							<p className="text-sm font-semibold text-amber-200">Update failed</p>
							<p className="mt-1 text-xs leading-relaxed text-amber-200/80">
								{state.error ?? "Something went wrong while updating."} You can keep using PR5Auth and try again later.
							</p>
						</>
					)}
				</div>

				<div className="flex shrink-0 items-center gap-2">
					{isAvailable && (
						<>
							<button
								onClick={handleLater}
								disabled={actionBusy}
								className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/10 disabled:opacity-50"
							>
								Later
							</button>
							<button
								onClick={handleUpdate}
								disabled={actionBusy}
								className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900 hover:bg-neutral-100 disabled:opacity-50"
							>
								{actionBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
								Update
							</button>
						</>
					)}
					{(isDownloading || isInstalling) && (
						<button
							onClick={onNavigateToSettings}
							className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/10"
						>
							Details
						</button>
					)}
					{isFailed && (
						<>
							<button
								onClick={handleDismissFailed}
								className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/10"
							>
								Dismiss
							</button>
							<button
								onClick={() => {
									setDismissed(false)
									void updateService.checkForUpdates(true)
								}}
								className="flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900 hover:bg-neutral-100"
							>
								<RefreshCw className="h-3.5 w-3.5" />
								Retry
							</button>
						</>
					)}
					{(isAvailable || isFailed) && (
						<button
							onClick={() => setDismissed(true)}
							aria-label="Dismiss update notification"
							className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-slate-200"
						>
							<X className="h-4 w-4" />
						</button>
					)}
				</div>
			</div>
		</div>
	)
}
