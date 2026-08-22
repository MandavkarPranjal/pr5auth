import { useState } from "react"
import { Eye, EyeOff, Lock, ShieldCheck } from "lucide-react"

export type LockScreenMode = "unlock" | "create"

interface LockScreenProps {
	mode: LockScreenMode
	onUnlock: (password: string) => Promise<void>
	onCreate: (password: string) => Promise<void>
}

export function LockScreen({ mode, onUnlock, onCreate }: LockScreenProps) {
	const [password, setPassword] = useState("")
	const [confirm, setConfirm] = useState("")
	const [show, setShow] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [loading, setLoading] = useState(false)

	const isCreate = mode === "create"

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault()
		setError(null)
		if (isCreate) {
			if (password.length < 8) {
				setError("Password must be at least 8 characters.")
				return
			}
			if (password !== confirm) {
				setError("Passwords do not match.")
				return
			}
			setLoading(true)
			try {
				await onCreate(password)
				// Parent will switch mode; clear sensitive fields
				setPassword("")
				setConfirm("")
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to create password")
			} finally {
				setLoading(false)
			}
		} else {
			if (!password) {
				setError("Enter your master password.")
				return
			}
			setLoading(true)
			try {
				await onUnlock(password)
				setPassword("")
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err)
				if (/Invalid master password|denied/i.test(msg)) {
					setError("Incorrect password. Try again.")
				} else {
					setError(msg || "Failed to unlock")
				}
			} finally {
				setLoading(false)
			}
		}
	}

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-[#080A10] p-6">
			<div className="animate-modal-in flex w-full max-w-sm flex-col items-center text-center">
				<div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-white/10">
					<Lock className="h-9 w-9 text-white" />
				</div>
				<h1 className="mt-6 text-2xl font-semibold tracking-tight text-white">
					{isCreate ? "Create master password" : "PR5Auth is locked"}
				</h1>
				<p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-500">
					{isCreate
						? "Your vault will be encrypted with Argon2. This password is never stored — don't lose it."
						: "Your codes are stored locally and encrypted. Enter your master password to unlock."}
				</p>

				<form onSubmit={handleSubmit} className="mt-8 w-full space-y-3">
					<div className="relative">
						<input
							type={show ? "text" : "password"}
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							placeholder={isCreate ? "Master password (≥8 chars)" : "Master password"}
							autoFocus
							className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 pr-10 text-sm text-white placeholder:text-slate-500 focus:border-white/30 focus:outline-none focus:ring-2 focus:ring-white/10"
							disabled={loading}
						/>
						<button
							type="button"
							onClick={() => setShow((v) => !v)}
							className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
							aria-label={show ? "Hide password" : "Show password"}
						>
							{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
						</button>
					</div>

					{isCreate && (
						<input
							type={show ? "text" : "password"}
							value={confirm}
							onChange={(e) => setConfirm(e.target.value)}
							placeholder="Confirm password"
							className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-white/30 focus:outline-none focus:ring-2 focus:ring-white/10"
							disabled={loading}
						/>
					)}

					{error && (
						<p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-left text-xs leading-relaxed text-red-300">
							{error}
						</p>
					)}

					<button
						type="submit"
						disabled={loading || (isCreate ? !password || !confirm : !password)}
						className="flex w-full items-center justify-center gap-2 rounded-xl bg-white text-zinc-900 px-6 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-neutral-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
					>
						<ShieldCheck className="h-4 w-4" />
						{loading ? "Please wait…" : isCreate ? "Create & unlock" : "Unlock vault"}
					</button>

					{!isCreate && (
						<p className="pt-1 text-[11px] leading-relaxed text-slate-600">
							Vault locks after 5 minutes of inactivity. Your master password is never stored.
						</p>
					)}
				</form>
			</div>
		</div>
	)
}
