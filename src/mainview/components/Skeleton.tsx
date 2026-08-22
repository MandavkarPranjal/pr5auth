export function SkeletonCard() {
	return (
		<div
			aria-hidden="true"
			className="animate-pulse overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5"
		>
			<div className="flex items-start gap-4">
				<div className="h-11 w-11 rounded-xl bg-white/[0.06]" />
				<div className="flex-1 space-y-2">
					<div className="h-3 w-20 rounded bg-white/[0.06]" />
					<div className="h-2.5 w-32 rounded bg-white/[0.04]" />
				</div>
				<div className="h-8 w-16 rounded bg-white/[0.04]" />
			</div>
			<div className="mt-4 flex items-end justify-between gap-4">
				<div className="h-7 w-36 rounded bg-white/[0.06]" />
				<div className="h-11 w-11 rounded-full bg-white/[0.04]" />
			</div>
		</div>
	);
}

export function SkeletonGrid({ count = 6 }: { count?: number }) {
	return (
		<div
			aria-busy="true"
			aria-label="Loading accounts"
			className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3"
		>
			{Array.from({ length: count }).map((_, i) => (
				<SkeletonCard key={i} />
			))}
		</div>
	);
}

export function PageSkeleton() {
	return (
		<div aria-busy="true" className="space-y-6">
			<div className="h-8 w-48 animate-pulse rounded bg-white/[0.06]" />
			<div className="h-4 w-64 animate-pulse rounded bg-white/[0.04]" />
			<SkeletonGrid count={6} />
		</div>
	);
}
