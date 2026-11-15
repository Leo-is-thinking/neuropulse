"use client";

import {
	Activity,
	ArrowDownRight,
	ArrowRight,
	ArrowUpRight,
	Box,
	Footprints,
	HeartPulse,
	type LucideIcon,
	Mic,
	Minus,
	Moon,
	Pill,
	Scale,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { flagFor, METRICS } from "@/data/patientsSeed";
import {
	type Cell,
	type DayColumn,
	type Flag,
	type Patient,
	type StreamId,
	WEEKDAYS,
} from "@/types/clinical";

const COLUMNS: DayColumn[] = [...WEEKDAYS, "Live"];

type RangeKey = "1w" | "1m" | "2m" | "3m" | "6m";
interface RangeDef {
	key: RangeKey;
	button: string;
	/** Weeks back from this week used as the comparison point. */
	back: number;
	phrase: string;
	chartTitle: string;
	ago: string;
	ticks: Record<number, string>;
}
const RANGES: RangeDef[] = [
	{
		key: "1w",
		button: "1 week",
		back: 1,
		phrase: "vs last week",
		chartTitle: "This week, day by day",
		ago: "last week's average",
		ticks: {},
	},
	{
		key: "1m",
		button: "1 month",
		back: 4,
		phrase: "over 1 month",
		chartTitle: "Last month, weekly average",
		ago: "1 month ago",
		ticks: {
			4: "4 weeks ago",
			3: "3 weeks ago",
			2: "2 weeks ago",
			1: "Last week",
			0: "This week",
		},
	},
	{
		key: "2m",
		button: "2 months",
		back: 8,
		phrase: "over 2 months",
		chartTitle: "Last 2 months, weekly average",
		ago: "2 months ago",
		ticks: { 8: "2 months ago", 4: "1 month ago", 0: "This week" },
	},
	{
		key: "3m",
		button: "3 months",
		back: 11,
		phrase: "over 3 months",
		chartTitle: "Last 3 months, weekly average",
		ago: "3 months ago",
		ticks: {
			11: "3 months ago",
			7: "2 months ago",
			3: "1 month ago",
			0: "This week",
		},
	},
	{
		key: "6m",
		button: "6 months",
		back: 25,
		phrase: "over 6 months",
		chartTitle: "Last 6 months, weekly average",
		ago: "6 months ago",
		ticks: {
			25: "6 months ago",
			17: "4 months ago",
			9: "2 months ago",
			0: "This week",
		},
	},
];
const DEFAULT_RANGE = 3;

interface StreamDef {
	id: StreamId;
	title: string;
	short: string;
	sub: string;
	icon: LucideIcon;
	primary: string;
}

// Acoustic is intentionally absent: it is only used as a correlation input for the analysis.
const STREAMS: StreamDef[] = [
	{
		id: "tremor",
		title: "Tremor & involuntary movements",
		short: "Tremor",
		sub: "Shaking and drug-induced movements",
		icon: Activity,
		primary: "tremor_burden",
	},
	{
		id: "voice",
		title: "Voice",
		short: "Voice",
		sub: "How much the patient speaks, and how strongly",
		icon: Mic,
		primary: "speech_rate",
	},
	{
		id: "balance",
		title: "Balance & falls",
		short: "Balance",
		sub: "Falls, stumbles and freezing, with the time since the last dose",
		icon: Scale,
		primary: "instability_events",
	},
	{
		id: "sleep",
		title: "Sleep",
		short: "Sleep",
		sub: "Night wake-ups (nocturia) and sleep quality",
		icon: Moon,
		primary: "nocturia",
	},
	{
		id: "mobility",
		title: "Mobility",
		short: "Mobility",
		sub: "Daily activity and time outdoors",
		icon: Footprints,
		primary: "steps",
	},
	{
		id: "adherence",
		title: "Medication",
		short: "Medication",
		sub: "Levodopa doses confirmed taken on time",
		icon: Pill,
		primary: "verified_doses",
	},
];

interface Display {
	label: string;
	unit: string;
	explain: string;
	/** Multiplies raw values for display (e.g. doses /3 → %). */
	scale?: number;
}

/** Plain-language names, units and one-line explanations. Raw store values are untouched. */
const DISPLAY: Record<string, Display> = {
	speech_rate: {
		label: "Speech rate",
		unit: "words / min",
		explain:
			"Words spoken per minute of speech. Lower means slower, weaker speech.",
	},
	verbal_engagement: {
		label: "Time talking",
		unit: "min / day",
		explain:
			"Minutes per day the patient speaks. A steady drop means withdrawal.",
	},
	tremor_burden: {
		label: "Tremor time",
		unit: "% of day",
		explain:
			"Share of waking hours with a resting tremor (shaking at 4–6 Hz) detected at the wrist.",
	},
	tremor_intensity: {
		label: "Tremor intensity",
		unit: "score / 10",
		explain:
			"How large the shaking is, from the wrist movement amplitude. 0 = barely visible, 10 = very large (≥ 0.5 g).",
	},
	dyskinesia_index: {
		label: "Involuntary movements",
		unit: "score / 10",
		explain: "Drug-induced involuntary movements. 0 = none, 10 = severe.",
	},
	first_tremor_after_dose: {
		label: "Dose lasts",
		unit: "min",
		explain:
			"Minutes after a levodopa dose before the tremor comes back. Shorter means the dose wears off earlier.",
	},
	hours_dose_to_fall: {
		label: "Fall after last dose",
		unit: "h",
		explain:
			"Hours between the last dose and a fall. A fall late after a dose points to wearing-off.",
	},
	instability_events: {
		label: "Falls & near-falls",
		unit: "events",
		explain: "Falls, stumbles and freezing episodes picked up by the band.",
	},
	nocturia: {
		label: "Night wake-ups",
		unit: "per night",
		explain:
			"Times the patient gets up at night, usually to urinate. More trips mean broken sleep and a higher fall risk.",
	},
	sleep_fragmentation: {
		label: "Broken sleep",
		unit: "% of night",
		explain: "Share of the night spent awake or restless.",
	},
	steps: {
		label: "Steps",
		unit: "steps / day",
		explain: "Steps counted by the band over the day.",
	},
	outdoor_time: {
		label: "Time outdoors",
		unit: "min / day",
		explain: "Minutes per day spent outside.",
	},
	bpm_peak: {
		label: "Peak heart rate",
		unit: "bpm",
		explain: "Highest heart rate reached during the day.",
	},
	hrv: {
		label: "Heart rate variability",
		unit: "ms",
		explain: "Beat-to-beat variation. Lower means more strain on the body.",
	},
	extrasystoles: {
		label: "Extra heartbeats",
		unit: "per day",
		explain: "Early or skipped beats detected.",
	},
	verified_doses: {
		label: "Doses taken on time",
		unit: "%",
		scale: 100 / 3,
		explain:
			"Share of the 3 daily levodopa doses confirmed by the band (hand-to-mouth gesture, water sound, tremor drop).",
	},
};

/** Metrics where the hero shows this week's average instead of the latest reading. */
const HERO_AVG = new Set(["verified_doses"]);

const FLAG_TEXT: Record<Flag, string> = {
	ok: "text-slate-900",
	warn: "text-amber-700",
	alert: "text-red-600",
};
const FLAG_FILL: Record<Flag, string> = {
	ok: "#2563eb",
	warn: "#f59e0b",
	alert: "#ef4444",
};
const FLAG_CELL: Record<Flag, string> = {
	ok: "text-slate-700",
	warn: "bg-amber-50 text-amber-800 font-medium",
	alert: "bg-red-50 text-red-700 font-semibold",
};
const FLAG_LABEL: Record<Flag, string> = {
	ok: "In range",
	warn: "Watch",
	alert: "Abnormal",
};
const FLAG_CHIP: Record<Flag, string> = {
	ok: "bg-emerald-50 text-emerald-700",
	warn: "bg-amber-50 text-amber-800",
	alert: "bg-red-50 text-red-700",
};

const fmt = (v: Cell["value"]) => (typeof v === "number" ? trimNum(v) : v);
const isNum = (v: Cell["value"] | undefined): v is number =>
	typeof v === "number";

type MetricMap = Map<string, Map<DayColumn, Cell>>;

function trimNum(n: number) {
	return Math.abs(n) >= 100
		? Math.round(n).toLocaleString("en-US")
		: String(Math.round(n * 10) / 10);
}

/** Latest meaningful reading: Live if numeric, else the last numeric weekday. */
function latest(days: Map<DayColumn, Cell>): Cell | null {
	const live = days.get("Live");
	if (live && isNum(live.value)) return live;
	for (let i = WEEKDAYS.length - 1; i >= 0; i--) {
		const c = days.get(WEEKDAYS[i]);
		if (c && isNum(c.value)) return c;
	}
	return null;
}

function weekValues(days: Map<DayColumn, Cell>): (number | null)[] {
	return WEEKDAYS.map((d) => {
		const v = days.get(d)?.value;
		return isNum(v) ? v : null;
	});
}

function mean(vals: (number | null)[]): number | null {
	const n = vals.filter((v): v is number => v !== null);
	return n.length ? n.reduce((a, b) => a + b, 0) / n.length : null;
}

/**
 * 26 weekly averages ending with this week (index 25); index 24 = the week of the last check-up.
 * Demo history: derived deterministically from this week's average (no stored long-term data yet).
 * The last 12 weeks are the 3-month window; older weeks extend the same drift further back.
 */
const N_WEEKS = 26;
const IDX_CHECKUP = 24;
const IDX_3M = 14;
function weeklyHistory(metric: string, avg: number, ref?: number): number[] {
	const start = ref !== undefined ? avg + (ref - avg) * 0.55 : avg * 0.95;
	const far = start + (start - avg) * 0.8;
	let h = 0;
	for (const ch of metric) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
	return Array.from({ length: N_WEEKS }, (_, i) => {
		if (i === N_WEEKS - 1) return avg;
		h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
		const noise = (h / 4294967296 - 0.5) * 0.06 * Math.max(Math.abs(avg), 1);
		const base =
			i <= IDX_3M
				? far + (start - far) * (i / IDX_3M)
				: start + (avg - start) * ((i - IDX_3M) / 11);
		return avg >= 0 ? Math.max(0, base + noise) : base + noise;
	});
}

function pctChange(cur: number, ref: number) {
	if (Math.abs(ref) < 1e-9) return cur === 0 ? 0 : 100;
	return ((cur - ref) / Math.abs(ref)) * 100;
}

/* ---------- charts ---------- */

interface Pt {
	label: string;
	v: number | null;
	flag?: Flag;
	showLabel?: boolean;
	valueLabel?: boolean;
}

function Sparkline({
	values,
	worse,
}: {
	values: (number | null)[];
	worse?: boolean;
}) {
	const nums = values.filter((v): v is number => v !== null);
	if (nums.length < 2) return <span className="text-slate-300">—</span>;
	const min = Math.min(...nums);
	const max = Math.max(...nums);
	const span = max - min || 1;
	const w = 72;
	const h = 22;
	const pts = values
		.map((v, i) =>
			v === null
				? null
				: `${(i / (values.length - 1)) * (w - 4) + 2},${h - 3 - ((v - min) / span) * (h - 6)}`,
		)
		.filter(Boolean)
		.join(" ");
	return (
		<svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
			<polyline
				fill="none"
				stroke={worse ? "#ef4444" : "#3b82f6"}
				strokeWidth="1.75"
				strokeLinejoin="round"
				strokeLinecap="round"
				points={pts}
			/>
		</svg>
	);
}

function LineChart({
	pts,
	refLine,
	title,
	id,
}: {
	pts: Pt[];
	refLine?: { v: number; text: string };
	title: string;
	id: string;
}) {
	const W = 780;
	const H = 280;
	const pad = { l: 40, r: 40, t: 34, b: 36 };
	const nums = pts.map((p) => p.v).filter((v): v is number => v !== null);
	if (nums.length < 2) return null;
	const pool = refLine ? [...nums, refLine.v] : nums;
	let lo = Math.min(...pool);
	let hi = Math.max(...pool);
	if (hi === lo) {
		hi += 1;
		lo -= 1;
	}
	const padY = (hi - lo) * 0.14;
	lo -= padY;
	hi += padY;
	const last = pts.length - 1;
	const x = (i: number) => pad.l + (i / last) * (W - pad.l - pad.r);
	const y = (v: number) =>
		pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
	const dots = pts
		.map((p, i) =>
			p.v === null ? null : { ...p, v: p.v, px: x(i), py: y(p.v) },
		)
		.filter(Boolean) as (Pt & { v: number; px: number; py: number })[];
	const line = dots.map((p) => `${p.px},${p.py}`).join(" ");
	const area = `${dots[0].px},${H - pad.b} ${line} ${dots[dots.length - 1].px},${H - pad.b}`;
	return (
		<svg
			viewBox={`0 0 ${W} ${H}`}
			className="h-auto w-full"
			role="img"
			aria-label={title}
		>
			<defs>
				<linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
					<stop offset="0%" stopColor="#3b82f6" stopOpacity="0.14" />
					<stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
				</linearGradient>
			</defs>
			{refLine && (
				<g>
					<line
						x1={pad.l}
						x2={W - pad.r}
						y1={y(refLine.v)}
						y2={y(refLine.v)}
						stroke="#cbd5e1"
						strokeDasharray="4 5"
					/>
					<text
						x={W - pad.r}
						y={y(refLine.v) - 5}
						textAnchor="end"
						fontSize="13"
						fill="#94a3b8"
					>
						{refLine.text}
					</text>
				</g>
			)}
			<polygon points={area} fill={`url(#${id})`} />
			<polyline
				points={line}
				fill="none"
				stroke="#3b82f6"
				strokeWidth="2.25"
				strokeLinejoin="round"
				strokeLinecap="round"
			/>
			{dots.map((p) => (
				<g key={p.label}>
					<circle
						cx={p.px}
						cy={p.py}
						r={p.valueLabel ? 5.5 : 3.5}
						fill="#fff"
						stroke={FLAG_FILL[p.flag ?? "ok"]}
						strokeWidth="2.25"
					>
						<title>{`${p.label}: ${trimNum(p.v)}`}</title>
					</circle>
					{p.valueLabel && (
						<text
							x={p.px}
							y={p.py - 10}
							textAnchor="middle"
							fontSize="14"
							fontWeight="700"
							fill={p.flag && p.flag !== "ok" ? FLAG_FILL[p.flag] : "#334155"}
						>
							{trimNum(p.v)}
						</text>
					)}
				</g>
			))}
			{pts.map((p, i) =>
				p.showLabel ? (
					<text
						key={`${p.label}-${i}`}
						x={i === 0 ? 8 : i === last ? W - 8 : x(i)}
						y={H - 10}
						textAnchor={i === 0 ? "start" : i === last ? "end" : "middle"}
						fontSize="14"
						fontWeight="500"
						fill="#475569"
					>
						{p.label}
					</text>
				) : null,
			)}
		</svg>
	);
}

/* ---------- pieces ---------- */

function TrendChip({
	pct,
	bad,
	suffix,
}: {
	pct: number;
	bad?: "high" | "low";
	suffix: string;
}) {
	if (Math.abs(pct) < 5)
		return (
			<span className="inline-flex items-center gap-1 text-xs text-slate-500">
				<Minus className="h-3 w-3" aria-hidden /> stable {suffix}
			</span>
		);
	const worse = bad === "high" ? pct > 0 : bad === "low" ? pct < 0 : false;
	const better = bad === "high" ? pct < 0 : bad === "low" ? pct > 0 : false;
	const Arrow = pct > 0 ? ArrowUpRight : ArrowDownRight;
	return (
		<span
			className={`inline-flex items-center gap-0.5 text-xs font-medium ${worse ? "text-red-600" : better ? "text-emerald-600" : "text-slate-600"}`}
		>
			<Arrow className="h-3.5 w-3.5" aria-hidden />
			{Math.abs(Math.round(pct))}% {suffix}
		</span>
	);
}

/** Shared numbers for one metric: this week, last check-up, 3 months. */
function computeStats(metric: string, days: Map<DayColumn, Cell>) {
	const avg = mean(weekValues(days));
	if (avg === null) return null;
	const ref = METRICS.find((m) => m.metric === metric)?.baseline;
	const scale = DISPLAY[metric]?.scale ?? 1;
	const weeks = weeklyHistory(
		metric,
		avg,
		ref !== undefined ? ref * scale : undefined,
	);
	return {
		avg,
		weeks,
		sinceCheckup: pctChange(avg, weeks[IDX_CHECKUP]),
		threeMonths: pctChange(avg, weeks[IDX_3M]),
	};
}

function OverviewTile({
	def,
	metrics,
}: {
	def: StreamDef;
	metrics: MetricMap;
}) {
	const days = metrics.get(def.primary);
	const mdef = METRICS.find((m) => m.metric === def.primary);
	const disp = DISPLAY[def.primary];
	const Icon = def.icon;
	const cur = days && latest(days);
	const stats = days ? computeStats(def.primary, days) : null;
	const worstFlag: Flag = days
		? WEEKDAYS.some((d) => days.get(d)?.flag === "alert")
			? "alert"
			: WEEKDAYS.some((d) => days.get(d)?.flag === "warn")
				? "warn"
				: "ok"
		: "ok";
	const avgMode = HERO_AVG.has(def.primary);
	const shown = avgMode && stats ? stats.avg : cur?.value;
	return (
		<a
			href={`#stream-${def.id}`}
			className="group block rounded-xl border border-slate-200 bg-white p-4 transition duration-150 hover:border-blue-400 hover:shadow-md hover:shadow-blue-900/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
		>
			<div className="flex items-center justify-between">
				<span className="flex items-center gap-2 text-xs font-medium text-slate-500">
					<Icon className="h-4 w-4 text-blue-600" aria-hidden />
					{def.short}
				</span>
				<span
					className={`h-2 w-2 rounded-full ${worstFlag === "alert" ? "bg-red-500" : worstFlag === "warn" ? "bg-amber-400" : "bg-emerald-500"}`}
					title={`Week: ${FLAG_LABEL[worstFlag]}`}
				/>
			</div>
			{shown !== undefined ? (
				<p className="mt-3 text-3xl font-semibold tabular-nums text-slate-900">
					{typeof shown === "number" ? trimNum(shown) : shown}
					<span className="ml-1 text-sm font-normal text-slate-500">
						{disp?.unit ?? mdef?.unit}
					</span>
				</p>
			) : (
				<p className="mt-3 text-3xl font-semibold text-slate-300">—</p>
			)}
			<p className="mt-0.5 truncate text-xs text-slate-500">
				{disp?.label ?? def.primary}
			</p>
			<div className="mt-3 flex items-end justify-between gap-2">
				<div className="min-h-[1rem]">
					{stats && (
						<TrendChip
							pct={stats.threeMonths}
							bad={mdef?.bad}
							suffix="over 3 months"
						/>
					)}
				</div>
				{stats && (
					<Sparkline
						values={stats.weeks.slice(IDX_3M)}
						worse={
							mdef?.bad === "high"
								? stats.threeMonths > 5
								: mdef?.bad === "low"
									? stats.threeMonths < -5
									: false
						}
					/>
				)}
			</div>
		</a>
	);
}

interface Props {
	patient: Patient;
	highlightCellId?: string | null;
	flashCellIds?: Set<string>;
}

export default function StreamPanels({
	patient,
	highlightCellId,
	flashCellIds,
}: Props) {
	const rootRef = useRef<HTMLDivElement>(null);
	const [chartMetric, setChartMetric] = useState<Record<string, string>>({});
	const [range, setRange] = useState<Record<string, number>>({});

	const grouped = useMemo(() => {
		const byStream = new Map<StreamId, MetricMap>();
		for (const c of patient.cells) {
			const d = DISPLAY[c.metric];
			const def = METRICS.find((m) => m.metric === c.metric);
			const scaled =
				d?.scale && isNum(c.value)
					? Math.round(c.value * d.scale * 10) / 10
					: c.value;
			const flag: Flag =
				c.day === "Live" && def && isNum(c.value)
					? flagFor(def, c.value)
					: c.flag;
			const cell: Cell = {
				...c,
				value: scaled,
				label: d?.label ?? c.label,
				unit: d?.unit ?? c.unit,
				flag,
			};
			if (!byStream.has(c.stream)) byStream.set(c.stream, new Map());
			const metrics = byStream.get(c.stream)!;
			if (!metrics.has(c.metric)) metrics.set(c.metric, new Map());
			metrics.get(c.metric)!.set(c.day, cell);
		}
		return byStream;
	}, [patient.cells]);

	useEffect(() => {
		if (!highlightCellId) return;
		const el = rootRef.current?.querySelector<HTMLElement>(
			`[data-cell-id="${CSS.escape(highlightCellId)}"]`,
		);
		el?.scrollIntoView({
			behavior: "smooth",
			block: "center",
			inline: "center",
		});
	}, [highlightCellId]);

	return (
		<div ref={rootRef} className="space-y-8">
			<section aria-labelledby="overview-h">
				<h2
					id="overview-h"
					className="mb-4 text-2xl font-bold tracking-tight text-blue-900"
				>
					Health signals this week
				</h2>
				<div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
					{STREAMS.map((s) => (
						<OverviewTile
							key={s.id}
							def={s}
							metrics={grouped.get(s.id) ?? new Map()}
						/>
					))}
				</div>
			</section>

			{STREAMS.map((s) => {
				const metrics = grouped.get(s.id);
				if (!metrics) return null;
				const Icon = s.icon;
				const numericMetrics = [...metrics.entries()].filter(
					([, days]) => weekValues(days).filter((v) => v !== null).length >= 2,
				);
				const activeKey = metrics.get(chartMetric[s.id] ?? s.primary)
					? (chartMetric[s.id] ?? s.primary)
					: numericMetrics[0]?.[0];
				const activeDays = activeKey ? metrics.get(activeKey) : undefined;
				const mdef = METRICS.find((m) => m.metric === activeKey);
				const disp = activeKey ? DISPLAY[activeKey] : undefined;
				const stats =
					activeDays && activeKey ? computeStats(activeKey, activeDays) : null;
				const cur = activeDays ? latest(activeDays) : null;
				const avgMode = !!activeKey && HERO_AVG.has(activeKey);
				const heroValue = avgMode && stats ? stats.avg : cur?.value;
				const rawAvg =
					stats && activeKey
						? stats.avg / (DISPLAY[activeKey]?.scale ?? 1)
						: null;
				const heroFlag: Flag =
					avgMode && mdef && rawAvg !== null
						? flagFor(mdef, rawAvg)
						: (cur?.flag ?? "ok");
				const unit = disp?.unit ?? cur?.unit ?? "";
				const label = disp?.label ?? "";

				const dailyPts: Pt[] = activeDays
					? WEEKDAYS.map((d) => {
							const c = activeDays.get(d);
							return {
								label: d,
								v: c && isNum(c.value) ? c.value : null,
								flag: c?.flag,
								showLabel: true,
								valueLabel: true,
							};
						})
					: [];
				const rgIdx = range[s.id] ?? DEFAULT_RANGE;
				const rg = RANGES[rgIdx];
				const rangePct = stats
					? pctChange(stats.avg, stats.weeks[N_WEEKS - 1 - rg.back])
					: 0;
				const weeklyPts: Pt[] =
					rg.key === "1w"
						? dailyPts
						: stats
							? stats.weeks.slice(N_WEEKS - 1 - rg.back).map((v, i, arr) => {
									const k = arr.length - 1 - i;
									return {
										label: rg.ticks[k] ?? `${k} wk ago`,
										v,
										showLabel: k in rg.ticks,
										valueLabel: k === 0,
										flag: "ok" as Flag,
									};
								})
							: [];

				return (
					<section
						key={s.id}
						id={`stream-${s.id}`}
						className="scroll-mt-28 overflow-hidden rounded-2xl border border-slate-200 bg-white"
					>
						<header className="flex items-center gap-3 border-b border-slate-100 px-5 py-3.5">
							<span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
								<Icon className="h-4 w-4" aria-hidden />
							</span>
							<div className="leading-tight">
								<h3 className="text-2xl font-bold tracking-tight text-blue-900">
									{s.title}
								</h3>
								<p className="text-xs text-slate-500">{s.sub}</p>
							</div>
							{(s.id === "tremor" || s.id === "voice") && (
								<Link
									href={`/modelization?patient=${patient.id}#${patient.id === "armel" ? (s.id === "tremor" ? "m-live" : "m-live-voice") : s.id === "tremor" ? "m-tremor" : "m-voice"}`}
									className="group ml-auto inline-flex shrink-0 items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-600/30 ring-1 ring-blue-700/20 transition hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-600/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
								>
									<Box className="h-4 w-4" aria-hidden />
									View modelization{" "}
									<ArrowRight
										className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
										aria-hidden
									/>
								</Link>
							)}
						</header>

						<div className="grid gap-6 px-5 py-5 lg:grid-cols-[320px_1fr]">
							<div>
								{numericMetrics.length > 1 && (
									<div
										className="mb-3 flex flex-wrap gap-1.5"
										role="tablist"
										aria-label="Measure shown"
									>
										{numericMetrics.map(([m, days]) => {
											const on = activeKey === m;
											return (
												<button
													key={m}
													role="tab"
													aria-selected={on}
													onClick={() =>
														setChartMetric((st) => ({ ...st, [s.id]: m }))
													}
													className={`cursor-pointer rounded-full px-2.5 py-1 text-xs font-medium transition-colors duration-150 ${
														on
															? "bg-blue-600 text-white"
															: "bg-slate-100 text-slate-600 hover:bg-slate-200"
													}`}
												>
													{[...days.values()][0].label}
												</button>
											);
										})}
									</div>
								)}
								{heroValue !== undefined && activeDays ? (
									<>
										<p className="text-xs text-slate-500">
											{label} ·{" "}
											{avgMode
												? "this week"
												: cur?.day === "Live"
													? "live now"
													: `last reading (${cur?.day})`}
										</p>
										<p
											className={`mt-1 text-5xl font-semibold tabular-nums tracking-tight ${FLAG_TEXT[heroFlag]}`}
										>
											{typeof heroValue === "number"
												? trimNum(heroValue)
												: heroValue}
											<span className="ml-1.5 text-base font-normal text-slate-500">
												{unit}
											</span>
										</p>
										<span
											className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${FLAG_CHIP[heroFlag]}`}
										>
											{FLAG_LABEL[heroFlag]}
										</span>
										{disp && (
											<p className="mt-3 text-xs leading-relaxed text-slate-500">
												{disp.explain}
											</p>
										)}
										{stats && (
											<div className="mt-5 flex gap-3 rounded-xl border-l-4 border-blue-600 bg-blue-50 px-4 py-3">
												<ArrowRight
													className="mt-0.5 h-5 w-5 shrink-0 text-blue-600"
													aria-hidden
												/>
												<ul className="min-w-0 flex-1 space-y-2 text-sm leading-snug text-slate-800">
													<li>
														<b>{label}</b> averaged{" "}
														<b>
															{trimNum(stats.avg)} {unit}
														</b>{" "}
														this week
													</li>
													<li>
														{trendBullet(
															stats.sinceCheckup,
															"since last check-up",
															mdef?.bad,
														)}
													</li>
													<li>{trendBullet(rangePct, rg.phrase, mdef?.bad)}</li>
												</ul>
											</div>
										)}
									</>
								) : (
									<p className="text-sm text-slate-400">
										No numeric reading yet.
									</p>
								)}
							</div>

							{stats && (
								<div className="min-w-0 space-y-4">
									<figure>
										<figcaption className="mb-2 text-sm font-semibold text-slate-700">
											{rg.chartTitle}
										</figcaption>
										<LineChart
											pts={weeklyPts}
											refLine={
												rg.key === "1w"
													? { v: stats.weeks[N_WEEKS - 2], text: rg.ago }
													: undefined
											}
											title={`${label}, ${rg.chartTitle}`}
											id={`np-w-${s.id}`}
										/>
									</figure>
									<div className="rounded-xl bg-slate-50 px-4 pb-3 pt-3">
										<label
											htmlFor={`range-${s.id}`}
											className="text-xs font-semibold uppercase tracking-wide text-slate-500"
										>
											Time scale
										</label>
										<input
											id={`range-${s.id}`}
											type="range"
											min={0}
											max={RANGES.length - 1}
											step={1}
											value={rgIdx}
											onChange={(e) =>
												setRange((st) => ({
													...st,
													[s.id]: Number(e.target.value),
												}))
											}
											aria-valuetext={rg.button}
											className="mt-2 block h-2 w-full cursor-pointer accent-blue-600"
										/>
										<div className="mt-1 flex justify-between">
											{RANGES.map((r, i) => (
												<button
													key={r.key}
													type="button"
													onClick={() =>
														setRange((st) => ({ ...st, [s.id]: i }))
													}
													className={`cursor-pointer text-xs transition-colors duration-150 ${i === rgIdx ? "font-bold text-blue-700" : "text-slate-500 hover:text-slate-800"}`}
												>
													{r.button}
												</button>
											))}
										</div>
									</div>
								</div>
							)}
						</div>

						<div className="overflow-x-auto border-t border-slate-100">
							<table className="w-full min-w-[760px] border-collapse text-[13px] tabular-nums">
								<thead>
									<tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
										<th className="sticky left-0 z-10 w-52 bg-slate-50 px-4 py-2 font-medium">
											Daily measurements
										</th>
										{COLUMNS.map((d) => (
											<th
												key={d}
												className={`px-2 py-2 text-right font-medium ${d === "Live" ? "bg-blue-50 text-blue-700" : "bg-slate-50"}`}
											>
												{d === "Live" ? (
													<span className="inline-flex items-center gap-1">
														<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-600" />
														LIVE
													</span>
												) : (
													d
												)}
											</th>
										))}
									</tr>
								</thead>
								<tbody>
									{[...metrics.entries()].map(([metric, days]) => {
										const first = days.values().next().value as Cell;
										return (
											<tr key={metric} className="border-t border-slate-100">
												<th
													scope="row"
													className="sticky left-0 z-10 bg-white px-4 py-1.5 text-left font-normal text-slate-800"
												>
													<div className="leading-tight">{first.label}</div>
													<div className="text-[11px] text-slate-400">
														{first.unit}
													</div>
												</th>
												{COLUMNS.map((d) => {
													const c = days.get(d);
													if (!c) return <td key={d} />;
													const highlighted = highlightCellId === c.id;
													const flashing = flashCellIds?.has(c.id);
													return (
														<td
															key={d}
															id={c.id}
															data-cell-id={c.id}
															title={c.note}
															className={`relative px-2 py-1.5 text-right transition-colors duration-500 ${
																d === "Live" && c.flag === "ok"
																	? "bg-blue-50/50"
																	: ""
															} ${FLAG_CELL[c.flag]} ${
																highlighted
																	? "z-20 animate-[np-pulse_1.2s_ease-in-out_3] rounded ring-2 ring-blue-600 ring-offset-1"
																	: ""
															} ${flashing ? "bg-blue-100" : ""}`}
														>
															{c.flag !== "ok" && (
																<span
																	className={`absolute left-1 top-2 h-1.5 w-1.5 rounded-full ${c.flag === "alert" ? "bg-red-500" : "bg-amber-500"}`}
																/>
															)}
															<span className="whitespace-normal break-words">
																{fmt(c.value)}
															</span>
														</td>
													);
												})}
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					</section>
				);
			})}
			<style>{`@keyframes np-pulse{0%,100%{box-shadow:0 0 0 0 rgba(37,99,235,.55)}50%{box-shadow:0 0 0 8px rgba(37,99,235,0)}}`}</style>
		</div>
	);
}

function trendBullet(pct: number, when: string, bad?: "high" | "low") {
	if (Math.abs(pct) < 5)
		return (
			<>
				<b>Stable</b> {when}
			</>
		);
	const worse = bad === "high" ? pct > 0 : bad === "low" ? pct < 0 : false;
	const better = bad === "high" ? pct < 0 : bad === "low" ? pct > 0 : false;
	return (
		<>
			<b>
				{pct > 0 ? "Up" : "Down"} {Math.abs(Math.round(pct))}%
			</b>{" "}
			{when}
			{(worse || better) && (
				<b className={worse ? "text-red-600" : "text-emerald-600"}>
					{" "}
					· {worse ? "worse" : "better"}
				</b>
			)}
		</>
	);
}
