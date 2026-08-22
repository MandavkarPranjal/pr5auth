import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorBoundaryProps {
	children: ReactNode;
	fallback?: ReactNode;
	onReset?: () => void;
}

interface ErrorBoundaryState {
	hasError: boolean;
	error: Error | null;
}

/**
 * Top-level error boundary that catches render-time crashes and
 * shows a recoverable fallback instead of a blank white screen.
 * Every route-level component should be wrapped with this.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
	constructor(props: ErrorBoundaryProps) {
		super(props);
		this.state = { hasError: false, error: null };
	}

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { hasError: true, error };
	}

	override componentDidCatch(error: Error, info: ErrorInfo): void {
		console.error("[ErrorBoundary] Uncaught render error:", error, info.componentStack);
	}

	private handleReset = (): void => {
		this.setState({ hasError: false, error: null });
		this.props.onReset?.();
	};

	override render(): ReactNode {
		if (this.state.hasError) {
			if (this.props.fallback !== undefined) return this.props.fallback;
			return (
				<div
					role="alert"
					aria-live="assertive"
					className="flex min-h-[50vh] flex-col items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/[0.06] p-8 text-center"
				>
					<div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/15">
						<AlertTriangle className="h-7 w-7 text-red-400" aria-hidden="true" />
					</div>
					<h2 className="mt-4 text-base font-semibold text-red-100">Something went wrong</h2>
					<p className="mt-1 max-w-md text-sm leading-relaxed text-red-300/70">
						{this.state.error?.message ?? "An unexpected error occurred. Your vault data is safe."}
					</p>
					{this.state.error?.stack && (
						<details className="mt-3 max-w-full text-left">
							<summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-400">
								Show details
							</summary>
							<pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-black/30 p-3 text-[11px] leading-relaxed text-slate-400">
								{this.state.error.stack.slice(0, 2000)}
							</pre>
						</details>
					)}
					<button
						onClick={this.handleReset}
						className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white/[0.08] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
					>
						<RefreshCw className="h-4 w-4" aria-hidden="true" />
						Try again
					</button>
				</div>
			);
		}
		return this.props.children;
	}
}

/** Lightweight functional wrapper for tests / simple usage */
export function ErrorFallback({
	message = "Something went wrong",
	onRetry,
}: {
	message?: string;
	onRetry?: () => void;
}): ReactNode {
	return (
		<div
			role="alert"
			className="flex flex-col items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/[0.06] p-8 text-center"
		>
			<AlertTriangle className="h-6 w-6 text-red-400" aria-hidden="true" />
			<p className="mt-3 text-sm font-medium text-red-200">{message}</p>
			{onRetry && (
				<button
					onClick={onRetry}
					className="mt-4 rounded-xl bg-white/[0.08] px-4 py-2 text-xs font-semibold text-white hover:bg-white/[0.12]"
				>
					Retry
				</button>
			)}
		</div>
	);
}
