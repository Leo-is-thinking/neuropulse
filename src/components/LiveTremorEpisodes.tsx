"use client";
// Tremor episodes recorded live from the band: when, how long, how fast (Hz), how strong (g) and in which
// wrist orientation. Lets the clinician see that tremors differ in nature, not only in size.
import { Play } from "lucide-react";
import { useEffect, useState } from "react";
import TremorReplay from "@/components/TremorReplay";
import type { TremorEpisode } from "@/types/clinical";

const POLL_MS = 1000;
const COLORS: Record<string, string> = {
	slow: "#d97706",
	rest: "#0f766e",
	fast: "#7c3aed",
};
const family = (kind: string) => kind.split("-")[0].split(" ")[0];
const colorOf = (e: TremorEpisode) => COLORS[family(e.kind)] ?? "#475569";
const timeOf = (iso: string) =>
	new Date(iso).toLocaleTimeString("fr-FR", {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
const secs = (e: TremorEpisode) =>
	Math.max(1, Math.round((+new Date(e.end) - +new Date(e.start)) / 1000));

/** Wrist orientation: needle rotated by roll, with pitch as a bar. */
function Orientation({ e }: { e: TremorEpisode }) {
	return (
		<svg
			viewBox="-20 -20 40 40"
			className="h-9 w-9 shrink-0"
			role="img"
			aria-label={`pitch ${e.pitch} degrees, roll ${e.roll} degrees`}
		>
			<circle r="17" fill="none" stroke="#cbd5e1" />
			<line
				x1="-14"
				y1="0"
				x2="14"
				y2="0"
				stroke={colorOf(e)}
				strokeWidth="3"
				strokeLinecap="round"
				transform={`rotate(${e.roll})`}
			/>
			<circle cx="0" cy={(-e.pitch / 90) * 12} r="2.5" fill="#0f172a" />
		</svg>
	);
}

function Scatter({ eps }: { eps: TremorEpisode[] }) {
	const W = 360;
	const H = 170;
	const p = { l: 38, r: 10, t: 10, b: 28 };
	const maxAmp = Math.max(0.3, ...eps.map((e) => e.amp_peak));
	const x = (hz: number) => p.l + ((hz - 3) / (13 - 3)) * (W - p.l - p.r);
	const y = (a: number) => H - p.b - (a / maxAmp) * (H - p.t - p.b);
	return (
		<svg
			viewBox={`0 0 ${W} ${H}`}
			className="w-full"
			role="img"
			aria-label="Tremor frequency against amplitude"
		>
			<rect
				x={x(4)}
				y={p.t}
				width={x(6.2) - x(4)}
				height={H - p.t - p.b}
				fill="#0f766e"
				opacity="0.08"
			/>
			{[3, 4, 6, 8, 10, 12].map((hz) => (
				<g key={hz}>
					<text
						x={x(hz)}
						y={H - 10}
						fontSize="9"
						textAnchor="middle"
						fill="#64748b"
					>
						{hz}
					</text>
				</g>
			))}
			<text x={W / 2} y={H - 1} fontSize="9" textAnchor="middle" fill="#64748b">
				Frequency (Hz) — shaded: classic rest tremor band 4–6 Hz
			</text>
			<text x="4" y={p.t + 6} fontSize="9" fill="#64748b">
				g
			</text>
			<line x1={p.l} x2={W - p.r} y1={H - p.b} y2={H - p.b} stroke="#cbd5e1" />
			<line x1={p.l} x2={p.l} y1={p.t} y2={H - p.b} stroke="#cbd5e1" />
			{eps.map((e, i) => (
				<g key={e.id ?? i}>
					<line
						x1={x(e.hz_min)}
						x2={x(e.hz_max)}
						y1={y(e.amp)}
						y2={y(e.amp)}
						stroke={colorOf(e)}
						opacity="0.5"
					/>
					<circle
						cx={x(e.hz)}
						cy={y(e.amp)}
						r={3 + Math.min(6, secs(e) / 8)}
						fill={colorOf(e)}
						opacity="0.75"
					/>
				</g>
			))}
		</svg>
	);
}

export default function LiveTremorEpisodes({
	patientId,
	follow = false,
}: {
	patientId: string;
	/** open the newest episode with raw data automatically, and keep following new ones */
	follow?: boolean;
}) {
	const [eps, setEps] = useState<TremorEpisode[]>([]);
	const [open, setOpen] = useState<TremorEpisode | null>(null);
	const [loading, setLoading] = useState<string | null>(null);
	const openReplay = async (e: TremorEpisode) => {
		if (!e.id) return;
		setLoading(e.id);
		try {
			const r = await fetch(
				`/api/tremor-episodes?patientId=${encodeURIComponent(patientId)}&id=${encodeURIComponent(e.id)}`,
				{ cache: "no-store" },
			);
			if (r.ok) setOpen((await r.json()) as TremorEpisode);
		} finally {
			setLoading(null);
		}
	};
	const newest = [...eps].reverse().find((e) => e.hasImu);
	// biome-ignore lint/correctness/useExhaustiveDependencies: only react to a new newest id
	useEffect(() => {
		if (follow && newest?.id && newest.id !== open?.id) openReplay(newest);
	}, [follow, newest?.id]);
	useEffect(() => {
		let alive = true;
		const tick = async () => {
			try {
				const r = await fetch(
					`/api/tremor-episodes?patientId=${encodeURIComponent(patientId)}`,
					{ cache: "no-store" },
				);
				if (r.ok && alive) setEps((await r.json()) as TremorEpisode[]);
			} catch {
				/* keep last list */
			}
		};
		tick();
		const t = setInterval(tick, POLL_MS);
		return () => {
			alive = false;
			clearInterval(t);
		};
	}, [patientId]);

	if (eps.length === 0)
		return (
			<p className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
				No tremor episode recorded yet. Shake the wrist steadily for about 6 s:
				the episode appears here once it stops.
			</p>
		);
	const shown = [...eps].reverse();
	const kinds = new Set(eps.map((e) => e.kind));
	return (
		<div className="space-y-4">
			<div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_1fr]">
				<div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
					<Scatter eps={eps} />
					<p className="mt-2 text-xs text-slate-500">
						{eps.length} episode{eps.length > 1 ? "s" : ""}, {kinds.size} type
						{kinds.size > 1 ? "s" : ""}. Dot size = duration, bar = frequency
						range.
					</p>
				</div>
				<ul className="max-h-[420px] space-y-2 overflow-auto">
					{shown.map((e, i) => (
						<li
							key={e.id ?? i}
							className={`flex items-center gap-3 rounded-xl border bg-white p-3 shadow-sm ${open?.id === e.id ? "border-teal-500 ring-1 ring-teal-500" : "border-slate-200"}`}
						>
							<Orientation e={e} />
							<div className="min-w-0 flex-1">
								<p
									className="text-sm font-semibold"
									style={{ color: colorOf(e) }}
								>
									{e.kind}
								</p>
								<p className="text-xs text-slate-600">
									{timeOf(e.start)} · {secs(e)} s · <b>{e.hz.toFixed(1)} Hz</b>{" "}
									({e.hz_min.toFixed(1)}–{e.hz_max.toFixed(1)}) ·{" "}
									{e.amp.toFixed(2)} g (peak {e.amp_peak.toFixed(2)})
								</p>
								<p className="text-xs text-slate-500">
									Wrist pitch {e.pitch}° · roll {e.roll}°
								</p>
							</div>
							{e.hasImu ? (
								<button
									type="button"
									onClick={() => openReplay(e)}
									disabled={loading === e.id}
									className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
								>
									<Play className="h-3.5 w-3.5" />{" "}
									{loading === e.id ? "Loading" : "3D replay"}
								</button>
							) : (
								<span
									className="shrink-0 text-[11px] text-slate-400"
									title="Recorded before raw capture existed"
								>
									no raw data
								</span>
							)}
						</li>
					))}
				</ul>
			</div>
			{open && <TremorReplay key={open.id} episode={open} />}
		</div>
	);
}
