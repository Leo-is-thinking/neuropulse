"use client";

import { useEffect, useState } from "react";
import type { LiveFeed, LiveSample } from "@/types/clinical";

const POLL_MS = 2000;

function Spark({
	label,
	unit,
	samples,
	color,
}: {
	label: string;
	unit: string;
	samples: LiveSample[];
	color: string;
}) {
	const w = 160;
	const h = 40;
	const last = samples.at(-1);
	let d = "";
	if (samples.length > 1) {
		const vs = samples.map((s) => s.v);
		const lo = Math.min(...vs);
		const hi = Math.max(...vs);
		const span = hi - lo || 1;
		d = samples
			.map(
				(s, i) =>
					`${i ? "L" : "M"}${((i / (samples.length - 1)) * w).toFixed(1)},${(h - 3 - ((s.v - lo) / span) * (h - 6)).toFixed(1)}`,
			)
			.join(" ");
	}
	return (
		<div className="flex items-center gap-3">
			<div className="min-w-0">
				<p className="text-xs font-medium uppercase tracking-wide text-slate-500">
					{label}
				</p>
				<p className="text-xl font-semibold tabular-nums text-slate-900">
					{last ? last.v.toFixed(1) : "--"}{" "}
					<span className="text-xs font-normal text-slate-500">{unit}</span>
				</p>
			</div>
			<svg
				viewBox={`0 0 ${w} ${h}`}
				className="h-10 w-40 shrink-0"
				role="img"
				aria-label={`${label} trend, last ${samples.length} samples`}
			>
				<line
					x1="0"
					y1={h - 0.5}
					x2={w}
					y2={h - 0.5}
					stroke="var(--np-border)"
				/>
				{d ? (
					<path
						d={d}
						fill="none"
						stroke={color}
						strokeWidth="1.75"
						strokeLinejoin="round"
						strokeLinecap="round"
					/>
				) : null}
			</svg>
		</div>
	);
}

/** Live sparklines from GET /api/live-feed (ring buffers). Polls every 2 s. */
export default function LiveSparklines({ patientId }: { patientId: string }) {
	const [feed, setFeed] = useState<LiveFeed>({});
	useEffect(() => {
		let alive = true;
		const tick = async () => {
			try {
				const r = await fetch(
					`/api/live-feed?patientId=${encodeURIComponent(patientId)}`,
					{ cache: "no-store" },
				);
				if (r.ok && alive) setFeed((await r.json()) as LiveFeed);
			} catch {
				/* keep last feed */
			}
		};
		tick();
		const t = setInterval(tick, POLL_MS);
		return () => {
			alive = false;
			clearInterval(t);
		};
	}, [patientId]);

	const hz = feed.tremor_hz ?? [];
	const hr = feed.bpm_peak ?? [];
	return (
		<section
			className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
			aria-label="Live signals"
		>
			<h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
				Live signals
			</h2>
			<div className="mt-3 grid gap-4 sm:grid-cols-2">
				<Spark
					label="Tremor frequency"
					unit="Hz"
					samples={hz}
					color="var(--np-alert)"
				/>
				<Spark
					label="Heart rate"
					unit="bpm"
					samples={hr}
					color="var(--np-alert)"
				/>
			</div>
			{hz.length === 0 && hr.length === 0 && (
				<p className="mt-3 text-xs text-slate-400">Waiting for live samples.</p>
			)}
		</section>
	);
}
