interface CountdownRingProps {
	progress: number;
	seconds: number;
	size?: number;
}

/**
 * Progress ring showing time until the TOTP code rotates.
 * progress is a value from 0 (about to rotate) to 1 (fresh).
 */
export function CountdownRing({ progress, seconds, size = 44 }: CountdownRingProps) {
	const stroke = 3.5;
	const radius = (size - stroke) / 2;
	const circumference = 2 * Math.PI * radius;
	const clamped = Math.min(1, Math.max(0, progress));
	const offset = circumference * (1 - clamped);

	const danger = seconds <= 5;
	const warning = seconds <= 10;

	const ringColor = danger
		? "text-red-500"
		: warning
			? "text-amber-400"
			: "text-indigo-500";

	const textColor = danger
		? "text-red-400"
		: warning
			? "text-amber-300"
			: "text-slate-400";

	return (
		<div className="relative" style={{ width: size, height: size }}>
			<svg width={size} height={size} className="-rotate-90">
				<circle
					cx={size / 2}
					cy={size / 2}
					r={radius}
					fill="none"
					strokeWidth={stroke}
					className="stroke-white/[0.07]"
				/>
				<circle
					cx={size / 2}
					cy={size / 2}
					r={radius}
					fill="none"
					strokeWidth={stroke}
					strokeLinecap="round"
					strokeDasharray={circumference}
					strokeDashoffset={offset}
					className={`${ringColor} transition-all duration-500 ease-linear ${
						danger ? "animate-pulse" : ""
					}`}
				/>
			</svg>
			<span
				className={`absolute inset-0 flex items-center justify-center text-xs font-semibold tabular-nums ${textColor}`}
			>
				{seconds}
			</span>
		</div>
	);
}
