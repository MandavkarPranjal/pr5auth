/** Skeleton loaders for first-paint and vault hydration. */

export function AccountCardSkeleton() {
	return (
		<div
			aria-hidden="true"
			className="animate-pulse overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5"
		>
			<div className="flex items-start gap-4">
				<div className="h-11 w-11 shrink-0 rounded-xl bg-white/[0.06]" />
				<div className="min-w-0 flex-1 space-y-2">
					<div className="h-3 w-24 rounded bg-white/[0.07]" />
					<div className="h-2.5 w-32 rounded bg-white/[0.04]" />
				</div>
				<div className="flex gap-1">
					<div className="h-8 w-8 rounded-lg bg-white/[0.04]" />
					<div className="h-8 w-8 rounded-lg bg-white/[0.04]" />
				</div>
			</div>
			<div className="mt-4 flex items-end justify-between">
				<div className="space-y-2">
					<div className="h-2 w-16 rounded bg-white/[0.04]" />
					<div className="h-7 w-32 rounded bg-white/[0.07]" />
				</div>
				<div className="h-11 w-11 rounded-full bg-white/[0.06]" />
			</div>
		</div>
	);
}

export function DashboardSkeleton({ count = 6 }: { count?: number }) {
	return (
		<div className="flex h-full flex-col" aria-busy="true" aria-label="Loading accounts">
			<header className="flex flex-wrap items-center justify-between gap-4 pb-6">
				<div className="space-y-2">
					<div className="h-6 w-32 rounded bg-white/[0.06]" />
					<div className="h-3 w-48 rounded bg-white/[0.04]" />
				</div>
				<div className="flex items-center gap-3">
					<div className="h-10 w-64 rounded-xl bg-white/[0.04]" />
					<div className="h-10 w-28 rounded-xl bg-white/[0.04]" />
				</div>
			</header>
			<div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
				{Array.from({ length: count }).map((_, i) => (
					<AccountCardSkeleton key={i} />
				))}
			</div>
			<span className="sr-only">Loading authenticator accounts…</span>
		</div>
	);
}

export function PageSkeleton() {
	return (
		<div className="flex h-full items-center justify-center" aria-busy="true" aria-label="Loading">
			<div className="flex flex-col items-center gap-3">
				<div className="h-8 w-8 animate-spin rounded-full border-2 border-white/[0.08] border-t-white/80" aria-hidden="true" />
				<p className="text-xs text-white">Loading…</p>
			</div>
		</div>
	);
}
