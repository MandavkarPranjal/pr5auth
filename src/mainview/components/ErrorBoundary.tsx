import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
	children: ReactNode;
	fallback?: ReactNode;
}

interface State {
	hasError: boolean;
	error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
	state: State = { hasError: false, error: null };

	static getDerivedStateFromError(error: Error): State {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		console.error("[ErrorBoundary]", error, info.componentStack);
	}

	handleReset = () => {
		this.setState({ hasError: false, error: null });
	};

	render() {
		if (this.state.hasError) {
			if (this.props.fallback) return this.props.fallback;
			return (
				<div
					role="alert"
					aria-live="assertive"
					className="flex h-full flex-col items-center justify-center p-8 text-center"
				>
					<div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10">
						<AlertTriangle className="h-6 w-6 text-red-400" />
					</div>
					<h2 className="mt-4 text-base font-semibold text-slate-200">
						Something went wrong
					</h2>
					<p className="mt-1 max-w-md text-xs leading-relaxed text-slate-500">
						{this.state.error?.message ?? "An unexpected error occurred."}
					</p>
					<button
						onClick={this.handleReset}
						className="mt-5 flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
					>
						<RefreshCw className="h-4 w-4" />
						Try again
					</button>
				</div>
			);
		}
		return this.props.children;
	}
}
