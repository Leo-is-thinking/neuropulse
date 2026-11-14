"use client";
// Tremor episodes and speech rate by hour of day, with levodopa dose times, to expose wearing-off patterns.
import {
	DOSE_HOURS,
	SPEECH_BY_HOUR,
	TREMOR_BY_HOUR,
} from "@/data/modelization";

const W = 760;
const H = 260;
const pad = { l: 44, r: 44, t: 28, b: 36 };
const H0 = 6;
const H1 = 22;
const x = (h: number) => pad.l + ((h - H0) / (H1 - H0)) * (W - pad.l - pad.r);
const bw = (W - pad.l - pad.r) / (H1 - H0) - 6;

export default function TimeOfDayChart() {
	const maxEp = 16;
	const yEp = (v: number) => H - pad.b - (v / maxEp) * (H - pad.t - pad.b);
	const yRate = (v: number) =>
		H - pad.b - ((v - 48) / (144 - 48)) * (H - pad.t - pad.b);
	const line = SPEECH_BY_HOUR.map(
		(p, i) => `${i ? "L" : "M"}${x(p.hour + 0.5)} ${yRate(p.rate)}`,
	).join(" ");
	return (
		<figure>
			<svg
				viewBox={`0 0 ${W} ${H}`}
				className="w-full"
				role="img"
				aria-label="Tremor episodes peak between 16:00 and 17:00, just before the 17:00 dose. Speech is slowest at wake-up and before the 17:00 dose."
			>
				{[0, 4, 8, 12, 16].map((v) => (
					<g key={v}>
						<line
							x1={pad.l}
							x2={W - pad.r}
							y1={yEp(v)}
							y2={yEp(v)}
							stroke="#f1f5f9"
						/>
						<text
							x={pad.l - 8}
							y={yEp(v) + 4}
							textAnchor="end"
							fontSize="12"
							fill="#64748b"
						>
							{v}
						</text>
					</g>
				))}
				{TREMOR_BY_HOUR.map((p) => (
					<rect
						key={p.hour}
						x={x(p.hour) + 3}
						y={yEp(p.episodes)}
						width={bw}
						height={H - pad.b - yEp(p.episodes)}
						rx="3"
						fill={p.episodes >= 9 ? "#ef4444" : "#93c5fd"}
					/>
				))}
				{DOSE_HOURS.map((d) => (
					<g key={d}>
						<line
							x1={x(d)}
							x2={x(d)}
							y1={pad.t - 6}
							y2={H - pad.b}
							stroke="#0f172a"
							strokeDasharray="4 4"
						/>
						<text
							x={x(d)}
							y={pad.t - 12}
							textAnchor="middle"
							fontSize="12"
							fontWeight="600"
							fill="#0f172a"
						>
							{`${Math.floor(d)}:${d % 1 ? "30" : "00"} dose`}
						</text>
					</g>
				))}
				<path
					d={line}
					fill="none"
					stroke="#d97706"
					strokeWidth="2.5"
					strokeLinejoin="round"
				/>
				{SPEECH_BY_HOUR.map((p) => (
					<circle
						key={p.hour}
						cx={x(p.hour + 0.5)}
						cy={yRate(p.rate)}
						r="3.5"
						fill="#d97706"
					/>
				))}
				{[8, 12, 16, 20].map((v) => (
					<text
						key={v}
						x={W - pad.r + 8}
						y={yRate(v + 4) + 4}
						fontSize="12"
						fill="#d97706"
					>
						{(v + 4) * 6}
					</text>
				))}
				{Array.from({ length: H1 - H0 }, (_, i) => H0 + i)
					.filter((h) => h % 2 === 0)
					.map((h) => (
						<text
							key={h}
							x={x(h + 0.5)}
							y={H - pad.b + 18}
							textAnchor="middle"
							fontSize="12"
							fill="#64748b"
						>{`${h}h`}</text>
					))}
			</svg>
			<figcaption className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600">
				<span className="inline-flex items-center gap-1.5">
					<span className="h-2.5 w-2.5 rounded-sm bg-blue-300" /> Tremor
					episodes per hour (left, last 4 weeks)
				</span>
				<span className="inline-flex items-center gap-1.5">
					<span className="h-2.5 w-2.5 rounded-sm bg-red-500" /> Peak hours
				</span>
				<span className="inline-flex items-center gap-1.5">
					<span className="h-0.5 w-4 bg-amber-600" /> Speech rate, words/min
					(right)
				</span>
			</figcaption>
		</figure>
	);
}
