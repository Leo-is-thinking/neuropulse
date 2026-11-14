"use client";
// T4 · Cross-modal entanglement: hand + glass + vocal folds + cardiac + nocturia → confidence, with rejected false positive.
import {
	Activity,
	AudioLines,
	Ban,
	BedDouble,
	HeartPulse,
	Mic,
	Sparkles,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import type { Analysis, Patient, StreamId } from "@/types/clinical";
import VibratingHand from "./VibratingHand";
import VocalCordVisualizer from "./VocalCordVisualizer";

/** Resting HR baseline used for the "+N bpm" surge (Live column is volatile). */
const RESTING_BPM = 74;
const SPEECH_BASELINE = 132;

function useCountUp(target: number, ms = 1000) {
	const [v, setV] = useState(0);
	useEffect(() => {
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
			return setV(target);
		let raf = 0;
		const t0 = performance.now();
		const tick = (now: number) => {
			const p = Math.min(1, (now - t0) / ms);
			setV(target * (1 - (1 - p) ** 3));
			if (p < 1) raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [target, ms]);
	return v;
}

function ConfidenceRing({ value }: { value: number }) {
	const shown = useCountUp(value * 100);
	const r = 44;
	const c = 2 * Math.PI * r;
	return (
		<div
			className="relative size-28"
			role="img"
			aria-label={`${Math.round(value * 100)} percent confidence`}
		>
			<svg viewBox="0 0 100 100" className="size-full -rotate-90">
				<circle
					cx="50"
					cy="50"
					r={r}
					fill="none"
					stroke="#e2e8f0"
					strokeWidth="8"
				/>
				<circle
					cx="50"
					cy="50"
					r={r}
					fill="none"
					stroke="#0d9488"
					strokeWidth="8"
					strokeLinecap="round"
					strokeDasharray={c}
					strokeDashoffset={c * (1 - shown / 100)}
				/>
			</svg>
			<div className="absolute inset-0 flex flex-col items-center justify-center">
				<span className="text-3xl font-semibold tabular-nums text-slate-900">
					{Math.round(shown)}%
				</span>
				<span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
					confidence
				</span>
			</div>
		</div>
	);
}

interface NodeSpec {
	key: StreamId;
	title: string;
	value: string;
	sub: string;
	icon: ReactNode;
	x: number;
	y: number;
	tone: "red" | "teal" | "slate";
	weight?: number;
}

const TONE = {
	red: "border-red-200 bg-red-50 text-red-700",
	teal: "border-blue-600/30 bg-blue-50 text-blue-800",
	slate: "border-slate-200 bg-slate-50 text-slate-700",
} as const;
const LINE = { red: "#ef4444", teal: "#0d9488", slate: "#64748b" } as const;

export default function EntanglementView({
	patient,
	analysis,
}: {
	patient: Patient;
	analysis: Analysis;
}) {
	const ev = (id?: string) => patient.events.find((e) => e.id === id);
	const spike = ev(
		analysis.links.find((l) => l.from.stream === "tremor")?.from.eventId,
	);
	const day = spike?.day;
	const dk = day?.toLowerCase();
	const cell = (stream: string, metric: string, d = dk) =>
		patient.cells.find(
			(c) => c.id === `${patient.id}.${d}.${stream}.${metric}`,
		);
	const num = (v?: number | string) => (typeof v === "number" ? v : NaN);

	const hz = num(spike?.value);
	const sameDay = (kind: string) =>
		patient.events.find((e) => e.day === day && e.kind === kind);
	const speechEv = sameDay("speech_drop");
	const speech =
		num(speechEv?.value) || num(cell("voice", "speech_rate")?.value);
	const hrEv = sameDay("hr_spike");
	const hr = num(hrEv?.value);
	const noc = num(cell("sleep", "nocturia")?.value);
	const eng = ["mon", "sun"].map((d) =>
		num(cell("voice", "verbal_engagement", d)?.value),
	);
	const engDelta =
		Number.isFinite(eng[0]) && eng[0] > 0
			? Math.round(((eng[1] - eng[0]) / eng[0]) * 100)
			: 0;
	const weightOf = (s: StreamId) =>
		analysis.links
			.filter((l) => l.to.stream === s)
			.reduce((a, l) => a + l.weight, 0);
	const rejected = analysis.rejected[0];

	const nodes: NodeSpec[] = spike
		? [
				{
					key: "tremor",
					title: "Wrist tremor",
					value: `${hz.toFixed(1)} Hz`,
					sub: `${spike.day} ${spike.time}`,
					icon: <Activity className="size-4" />,
					x: 12,
					y: 18,
					tone: "red",
				},
				{
					key: "acoustic",
					title: "Glass break",
					value: "Audio tag",
					sub: "Object_Drop_Glass_Break",
					icon: <AudioLines className="size-4" />,
					x: 12,
					y: 78,
					tone: "red",
					weight: weightOf("acoustic"),
				},
				{
					key: "voice",
					title: "Vocal fold atrophy",
					value: `${speech.toFixed(1)} words/min`,
					sub: `baseline ${SPEECH_BASELINE.toFixed(1)}`,
					icon: <Mic className="size-4" />,
					x: 88,
					y: 18,
					tone: "teal",
					weight: weightOf("voice"),
				},
				{
					key: "cardiac",
					title: "Cardiac surge",
					value: `+${Math.round(hr - RESTING_BPM)} bpm`,
					sub: `${hr} bpm · arrhythmia`,
					icon: <HeartPulse className="size-4" />,
					x: 88,
					y: 78,
					tone: "red",
					weight: weightOf("cardiac"),
				},
				{
					key: "sleep",
					title: "Nocturia",
					value: `${noc} wake-ups`,
					sub: "night before",
					icon: <BedDouble className="size-4" />,
					x: 50,
					y: 92,
					tone: "slate",
					weight: weightOf("sleep"),
				},
			]
		: [];

	return (
		<div className="space-y-5">
			<header className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="min-w-0">
					<p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
						<Sparkles className="size-3.5 text-blue-700" /> Cross-modal AI
						synthesis ·{" "}
						{analysis.source === "gemini" ? "Gemini" : "Deterministic engine"}
					</p>
					<p className="mt-1 max-w-2xl text-sm text-slate-700">
						{analysis.summary}
					</p>
				</div>
				<ConfidenceRing value={analysis.confidence} />
			</header>

			{spike ? (
				<>
					<div className="grid gap-5 lg:grid-cols-2">
						<VibratingHand hz={hz} spikeTime={spike.time} />
						<VocalCordVisualizer
							speechRate={speech}
							baseline={SPEECH_BASELINE}
							engagementDeltaPct={engDelta}
						/>
					</div>

					<section
						className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
						aria-label="Entanglement graph"
					>
						<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
							Entanglement graph
						</p>
						<div className="relative mx-auto mt-3 h-[340px] w-full max-w-4xl">
							<style>{`
                @keyframes np-draw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
                .np-link{stroke-dasharray:1;stroke-dashoffset:1;animation:np-draw .8s ease-out forwards}
                @media (prefers-reduced-motion: reduce){.np-link{animation:none;stroke-dashoffset:0}}
              `}</style>
							<svg
								viewBox="0 0 100 100"
								preserveAspectRatio="none"
								className="absolute inset-0 size-full"
								aria-hidden="true"
							>
								{nodes.map((n, i) => (
									<line
										key={n.key}
										className="np-link"
										pathLength={1}
										x1={50}
										y1={46}
										x2={n.x}
										y2={n.y}
										stroke={LINE[n.tone]}
										strokeOpacity={0.55}
										strokeWidth={Math.max(1.5, (n.weight ?? 0.5) * 22)}
										strokeLinecap="round"
										vectorEffect="non-scaling-stroke"
										style={{ animationDelay: `${i * 0.18}s` }}
									/>
								))}
							</svg>
							<div className="absolute left-1/2 top-[46%] flex size-24 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border-2 border-blue-600 bg-white shadow-sm">
								<span className="text-2xl font-semibold tabular-nums text-blue-700">
									{Math.round(analysis.confidence * 100)}%
								</span>
								<span className="text-[10px] font-medium uppercase text-slate-500">
									Wearing-off
								</span>
							</div>
							{nodes.map((n) => (
								<div
									key={n.key}
									className={`absolute w-40 -translate-x-1/2 -translate-y-1/2 rounded-lg border p-2.5 text-xs shadow-sm sm:w-44 ${TONE[n.tone]}`}
									style={{ left: `${n.x}%`, top: `${n.y}%` }}
								>
									<p className="flex items-center gap-1.5 font-semibold">
										{n.icon}
										{n.title}
									</p>
									<p className="mt-0.5 text-base font-semibold tabular-nums">
										{n.value}
									</p>
									<p className="flex justify-between gap-2 opacity-80">
										<span className="truncate">{n.sub}</span>
										{n.weight ? (
											<span className="tabular-nums">
												+{Math.round(n.weight * 100)}%
											</span>
										) : null}
									</p>
								</div>
							))}
						</div>
						<ul className="mt-3 grid gap-1.5 text-sm text-slate-600 sm:grid-cols-2">
							{analysis.links.map((l, i) => (
								<li
									key={i}
									className="flex items-baseline justify-between gap-3 rounded-lg bg-slate-50 px-3 py-1.5"
								>
									<span>{l.relation}</span>
									<span className="tabular-nums text-slate-500">
										+{Math.round(l.weight * 100)}%
									</span>
								</li>
							))}
						</ul>
					</section>
				</>
			) : (
				<div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600 shadow-sm">
					No cross-modal incident was confirmed this week.
				</div>
			)}

			<div className="grid gap-5 lg:grid-cols-2">
				{rejected && (
					<section
						className="rounded-xl border border-amber-200 bg-amber-50 p-5"
						aria-label="Rejected false positive"
					>
						<p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-800">
							<Ban className="size-3.5" /> Rejected false positive
						</p>
						<p className="mt-1 text-base font-semibold text-slate-900">
							{rejected.label}
						</p>
						<ul className="mt-2 space-y-1 text-sm text-slate-700">
							{rejected.reasons.map((r) => (
								<li key={r} className="flex gap-2">
									<span className="mt-2 size-1 shrink-0 rounded-full bg-amber-600" />
									{r}
								</li>
							))}
						</ul>
					</section>
				)}
				<section
					className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
					aria-label="Cross-check reliability"
				>
					<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
						Cross-check reliability
					</p>
					<ul className="mt-2 space-y-3">
						{analysis.crossChecks.map((c) => (
							<li key={c.event}>
								<div className="flex items-baseline justify-between gap-3">
									<span className="text-sm font-medium text-slate-900">
										{c.event}
									</span>
									<span className="text-sm font-semibold tabular-nums text-blue-700">
										{Math.round(c.reliability * 100)}%
									</span>
								</div>
								<div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
									<div
										className="h-full rounded-full bg-blue-600"
										style={{ width: `${c.reliability * 100}%` }}
									/>
								</div>
								<p className="mt-1 text-xs text-slate-500">
									Eliminates: {c.falsePositiveEliminated}
								</p>
							</li>
						))}
					</ul>
				</section>
			</div>
		</div>
	);
}
