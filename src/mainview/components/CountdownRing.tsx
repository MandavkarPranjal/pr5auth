interface CountdownRingProps {
	progress: number;
	seconds: number;
	size?: number;
}

export function CountdownRing({ progress, seconds, size = 44 }: CountdownRingProps) {
	const stroke = 3;
	const radius = (size - stroke) / 2 - 1;
	const circumference = 2 * Math.PI * radius;

	const clamped = Math.min(1, Math.max(0, progress));

	const danger = seconds <= 5;

	const ringColor = danger ? "#ff5f57" : "#e4e4e7";
	const textColor = danger ? "#ff5f57" : "#ffffff";

	return (
		<div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
			<svg width={size} height={size} className="absolute inset-0 block -rotate-90">
				<circle
					cx={size / 2}
					cy={size / 2}
					r={radius}
					fill="none"
					strokeWidth={stroke}
					className="stroke-white/15"
				/>
				<circle
					cx={size / 2}
					cy={size / 2}
					r={radius}
					fill="none"
					strokeWidth={stroke}
					strokeLinecap="round"
					strokeDasharray={circumference}
					strokeDashoffset={(1 - clamped) * circumference}
					stroke={ringColor}
				/>
			</svg>
			<span
				className="relative text-xl font-bold leading-none tabular-nums"
				style={{ color: textColor }}
			>
				{seconds}
			</span>
		</div>
	);
}
