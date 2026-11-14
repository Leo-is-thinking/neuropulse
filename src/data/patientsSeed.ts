import {
	type Cell,
	type DayColumn,
	type Flag,
	type Patient,
	type Schedule,
	type StreamId,
	type TimelineEvent,
	WEEKDAYS,
	type Weekday,
} from "@/types/clinical";

// ---------- Metric catalog ----------
interface MetricDef {
	stream: StreamId;
	metric: string;
	label: string;
	unit: string;
	baseline?: number;
	/** "high" = bigger is worse, "low" = smaller is worse */
	bad?: "high" | "low";
	warn?: number;
	alert?: number;
}

export const METRICS: MetricDef[] = [
	{
		stream: "voice",
		metric: "speech_rate",
		label: "Speech Rate",
		unit: "words/min",
		baseline: 132,
		bad: "low",
		warn: 102,
		alert: 84,
	},
	{
		stream: "voice",
		metric: "verbal_engagement",
		label: "Daily Verbal Engagement",
		unit: "min/day",
		baseline: 59,
		bad: "low",
		warn: 40,
		alert: 30,
	},
	{
		stream: "tremor",
		metric: "tremor_burden",
		label: "Tremor Burden (4–6 Hz)",
		unit: "% awake",
		baseline: 10,
		bad: "high",
		warn: 18,
		alert: 25,
	},
	{
		stream: "tremor",
		metric: "tremor_intensity",
		label: "Tremor Intensity",
		unit: "0–10",
		baseline: 2,
		bad: "high",
		warn: 4,
		alert: 6,
	},
	{
		stream: "tremor",
		metric: "dyskinesia_index",
		label: "Dyskinesia Index",
		unit: "0–10",
		baseline: 1,
		bad: "high",
		warn: 3,
		alert: 5,
	},
	{
		stream: "tremor",
		metric: "first_tremor_after_dose",
		label: "First Tremor After Dose",
		unit: "min",
		baseline: 300,
		bad: "low",
		warn: 270,
		alert: 255,
	},
	{
		stream: "balance",
		metric: "hours_dose_to_fall",
		label: "Hours Dose → Fall",
		unit: "h",
	},
	{
		stream: "balance",
		metric: "instability_events",
		label: "Fall & Instability Events",
		unit: "events",
		baseline: 0,
		bad: "high",
		warn: 1,
		alert: 2,
	},
	{
		stream: "sleep",
		metric: "nocturia",
		label: "Nocturia Wake-Ups",
		unit: "trips/night",
		baseline: 1,
		bad: "high",
		warn: 2,
		alert: 4,
	},
	{
		stream: "sleep",
		metric: "sleep_fragmentation",
		label: "Sleep Fragmentation",
		unit: "%",
		baseline: 20,
		bad: "high",
		warn: 35,
		alert: 50,
	},
	{
		stream: "mobility",
		metric: "steps",
		label: "Active Steps",
		unit: "steps",
		baseline: 6000,
		bad: "low",
		warn: 4500,
		alert: 3000,
	},
	{
		stream: "mobility",
		metric: "outdoor_time",
		label: "Outdoor Time",
		unit: "min",
		baseline: 45,
		bad: "low",
		warn: 20,
		alert: 10,
	},
	{
		stream: "acoustic",
		metric: "acoustic_tags",
		label: "Acoustic Context Tags",
		unit: "tags",
	},
	{
		stream: "cardiac",
		metric: "bpm_peak",
		label: "Peak Heart Rate",
		unit: "bpm",
		baseline: 80,
		bad: "high",
		warn: 95,
		alert: 105,
	},
	{
		stream: "cardiac",
		metric: "hrv",
		label: "HRV (RMSSD)",
		unit: "ms",
		baseline: 32,
		bad: "low",
		warn: 25,
		alert: 20,
	},
	{
		stream: "cardiac",
		metric: "extrasystoles",
		label: "Extrasystoles",
		unit: "count",
		baseline: 1,
		bad: "high",
		warn: 5,
		alert: 8,
	},
	{
		stream: "adherence",
		metric: "verified_doses",
		label: "Verified Med Adherence",
		unit: "/3 doses",
		baseline: 3,
		bad: "low",
		warn: 2.5,
		alert: 1.5,
	},
];

/** Metrics the Vexo band cannot measure: shown from simulated/seed data, never from live hardware. */
export const SIMULATED_METRICS = new Set([
	"speech_rate",
	"bpm_peak",
	"hrv",
	"extrasystoles",
]);

export function flagFor(def: MetricDef, v: number | string): Flag {
	if (
		typeof v !== "number" ||
		!def.bad ||
		def.warn === undefined ||
		def.alert === undefined
	)
		return "ok";
	if (def.bad === "high")
		return v >= def.alert ? "alert" : v >= def.warn ? "warn" : "ok";
	return v <= def.alert ? "alert" : v <= def.warn ? "warn" : "ok";
}

export const cellId = (
	pid: string,
	day: DayColumn,
	stream: StreamId,
	metric: string,
) => `${pid}.${day.toLowerCase()}.${stream}.${metric}`;

type Series = Record<string, (number | string)[]>;
type Overrides = Record<string, { flag?: Flag; note?: string }>; // key: `${metric}.${Day}`

function buildCells(
	pid: string,
	series: Series,
	live: Record<string, number | string>,
	overrides: Overrides = {},
): Cell[] {
	const cells: Cell[] = [];
	for (const def of METRICS) {
		const vals = series[def.metric];
		for (let i = 0; i < 7; i++) {
			const day = WEEKDAYS[i];
			const v = vals[i];
			const o = overrides[`${def.metric}.${day}`];
			cells.push({
				id: cellId(pid, day, def.stream, def.metric),
				patientId: pid,
				day,
				stream: def.stream,
				metric: def.metric,
				label: def.label,
				value: v,
				unit: def.unit,
				baseline: def.baseline,
				flag: o?.flag ?? flagFor(def, v),
				note: o?.note,
			});
		}
		cells.push({
			id: cellId(pid, "Live", def.stream, def.metric),
			patientId: pid,
			day: "Live",
			stream: def.stream,
			metric: def.metric,
			label: def.label,
			value: live[def.metric] ?? "—",
			unit: def.unit,
			baseline: def.baseline,
			flag: "ok",
			note: SIMULATED_METRICS.has(def.metric)
				? "Simulated: no sensor on the band (needs mic STT / PPG)"
				: undefined,
		});
	}
	return cells;
}

const defaultSchedule = (): Schedule => ({
	doses: [
		{ id: "dose-am", label: "Levodopa", time: "08:00", mg: 100 },
		{ id: "dose-noon", label: "Levodopa", time: "12:30", mg: 100 },
		{ id: "dose-pm", label: "Levodopa", time: "17:00", mg: 100 },
	],
	nudges: [],
});

// ---------- Henri M. (primary demo case) ----------
const H = "henri-m";
const ev = (e: Omit<TimelineEvent, "id">, n: number): TimelineEvent => ({
	id: `${H}.ev${n}`,
	...e,
});

function henri(): Patient {
	const cells = buildCells(
		H,
		{
			speech_rate: [92.4, 67.2, 85.2, 82.8, 78, 87, 81.6],
			verbal_engagement: [47, 41, 38, 36, 35, 31, 29],
			tremor_burden: [13, 31, 14, 12, 15, 16, 14],
			tremor_intensity: [2.4, 5.8, 2.6, 2.2, 2.8, 3.0, 2.6],
			dyskinesia_index: [1.2, 1.4, 1.1, 1.0, 1.3, 1.5, 1.2],
			first_tremor_after_dose: [285, 250, 290, 280, 295, 270, 285],
			hours_dose_to_fall: ["—", 4.2, "—", 4.8, "—", 5.5, "—"],
			instability_events: [0, 2, 0, 1, 0, 1, 0],
			nocturia: [3, 5, 3, 4, 3, 4, 4],
			sleep_fragmentation: [38, 46, 41, 44, 40, 47, 45],
			steps: [3800, 3100, 3600, 3300, 3500, 2900, 2700],
			outdoor_time: [28, 12, 25, 18, 22, 8, 6],
			acoustic_tags: [
				"Pill_Water ×3",
				"Object_Drop_Glass_Break ×1 · Pill_Water ×2",
				"Pill_Water ×3",
				"Pill_Water ×3",
				"Pill_Water ×3",
				"Crowd_Stress ×1 · Pill_Water ×3",
				"Pill_Water ×3",
			],
			bpm_peak: [88, 96, 84, 86, 87, 90, 85],
			hrv: [28, 19, 29, 27, 26, 25, 27],
			extrasystoles: [2, 9, 1, 2, 3, 3, 2],
			verified_doses: [3, 2, 3, 3, 3, 3, 3],
		},
		{
			speech_rate: 80.4,
			tremor_burden: "—",
			tremor_intensity: "—",
			bpm_peak: 74,
			acoustic_tags: "—",
			instability_events: 0,
		},
		{
			"tremor_burden.Tue": {
				flag: "alert",
				note: "Spike 16:40 (5.3 Hz), 20 min before 17:00 dose. Typical day: 14%.",
			},
			"tremor_burden.Wed": {
				note: "08:15 motion burst = toothbrushing (rejected, on-state, HR 72).",
			},
			"acoustic_tags.Tue": {
				flag: "alert",
				note: "16:40 glass drop — involuntary release.",
			},
			"acoustic_tags.Sat": { flag: "warn" },
			"instability_events.Tue": {
				note: "Near-fall 16:42 + freezing episode 16:55.",
			},
			"instability_events.Thu": { note: "Freezing of gait at doorway 12:50." },
			"instability_events.Sat": { note: "Near-fall in crowd." },
			"verified_doses.Tue": {
				flag: "warn",
				note: "17:00 dose not yet taken at spike time.",
			},
		},
	);
	// Live column baseline resting values
	for (const c of cells) {
		if (c.day !== "Live") continue;
		if (c.metric === "speech_rate") c.flag = "alert";
	}

	const events: TimelineEvent[] = [
		ev(
			{
				day: "Tue",
				time: "08:00",
				stream: "adherence",
				kind: "dose",
				label: "Levodopa 08:00 taken",
			},
			1,
		),
		ev(
			{
				day: "Tue",
				time: "16:34",
				stream: "voice",
				kind: "speech_drop",
				label: "Speech rate 67.2 words/min (baseline 132)",
				value: 11.2,
			},
			2,
		),
		ev(
			{
				day: "Tue",
				time: "16:40",
				stream: "tremor",
				kind: "tremor_spike",
				label: "Resting tremor 5.3 Hz",
				value: 5.3,
				cellRef: cellId(H, "Tue", "tremor", "tremor_burden"),
			},
			3,
		),
		ev(
			{
				day: "Tue",
				time: "16:40",
				stream: "cardiac",
				kind: "hr_spike",
				label: "HR 96 bpm + extrasystole cluster",
				value: 96,
				cellRef: cellId(H, "Tue", "cardiac", "bpm_peak"),
			},
			4,
		),
		ev(
			{
				day: "Tue",
				time: "16:40",
				stream: "acoustic",
				kind: "acoustic_tag",
				label: "Object_Drop_Glass_Break",
				value: "Object_Drop_Glass_Break",
				cellRef: cellId(H, "Tue", "acoustic", "acoustic_tags"),
			},
			5,
		),
		ev(
			{
				day: "Tue",
				time: "16:42",
				stream: "balance",
				kind: "near_fall",
				label: "Near-fall stumble",
				cellRef: cellId(H, "Tue", "balance", "instability_events"),
			},
			6,
		),
		ev(
			{
				day: "Tue",
				time: "17:00",
				stream: "adherence",
				kind: "dose",
				label: "Levodopa 17:00 scheduled",
			},
			7,
		),
		ev(
			{
				day: "Wed",
				time: "08:00",
				stream: "adherence",
				kind: "dose",
				label: "Levodopa 08:00 taken",
			},
			8,
		),
		ev(
			{
				day: "Wed",
				time: "08:15",
				stream: "tremor",
				kind: "tremor_spike",
				label: "4.9 Hz rhythmic wrist motion",
				value: 4.9,
				context: "brushing_pattern",
				cellRef: cellId(H, "Wed", "tremor", "tremor_burden"),
			},
			9,
		),
	];

	return {
		id: H,
		name: "Henri M.",
		age: 74,
		initials: "HM",
		urgency: "critical",
		stage: 3,
		headline: "Pre-dose wearing-off + glass drop Tue 16:40",
		cells,
		events,
		schedule: defaultSchedule(),
		prescriptionVersion: 1,
		adherenceArmed: null,
		wristLog: [],
	};
}

// ---------- Generated patients (seeded, deterministic) ----------
function rng(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

interface Profile {
	id: string;
	name: string;
	age: number;
	initials: string;
	urgency: Patient["urgency"];
	stage: Patient["stage"];
	headline: string;
	seed: number;
	speech: number;
	engagement: number;
	tremor: number;
	dysk: number;
	fallP: number;
	nocturia: number;
	steps: number;
	outdoor: number;
	bpm: number;
	hrv: number;
	firstTremor: number;
}

function generated(p: Profile): Patient {
	const r = rng(p.seed);
	const j = (base: number, spread: number, dp = 0) => {
		const v = base + (r() - 0.5) * 2 * spread;
		const k = 10 ** dp;
		return Math.round(v * k) / k;
	};
	const days = WEEKDAYS;
	const falls = days.map(() => (r() < p.fallP ? 1 : 0));
	const series: Series = {
		speech_rate: days.map(() => j(p.speech, 7, 0)),
		verbal_engagement: days.map(() => j(p.engagement, 5)),
		tremor_burden: days.map(() => j(p.tremor, 3)),
		tremor_intensity: days.map(() => Math.max(0, j(p.tremor / 6, 0.6, 1))),
		dyskinesia_index: days.map(() => j(p.dysk, 0.4, 1)),
		first_tremor_after_dose: days.map(() => j(p.firstTremor, 12)),
		hours_dose_to_fall: falls.map((f) => (f ? j(5, 0.8, 1) : "—")),
		instability_events: falls,
		nocturia: days.map(() => Math.max(0, Math.round(j(p.nocturia, 0.8)))),
		sleep_fragmentation: days.map(() => j(20 + p.nocturia * 6, 4)),
		steps: days.map(() => j(p.steps, 600)),
		outdoor_time: days.map(() => Math.max(0, j(p.outdoor, 8))),
		acoustic_tags: days.map(() => "Pill_Water ×3"),
		bpm_peak: days.map(() => j(p.bpm, 4)),
		hrv: days.map(() => j(p.hrv, 3)),
		extrasystoles: days.map(() => Math.max(0, Math.round(j(2, 1.5)))),
		verified_doses: days.map(() => (r() < 0.15 ? 2 : 3)),
	};
	return {
		id: p.id,
		name: p.name,
		age: p.age,
		initials: p.initials,
		urgency: p.urgency,
		stage: p.stage,
		headline: p.headline,
		cells: buildCells(p.id, series, {
			speech_rate: p.speech,
			bpm_peak: p.bpm - 8,
		}),
		events: [],
		schedule: defaultSchedule(),
		prescriptionVersion: 1,
		adherenceArmed: null,
		wristLog: [],
	};
}

// ---------- Armel (live band only: no seeded history, no simulated data) ----------
function armel(): Patient {
	const empty = Object.fromEntries(
		METRICS.map((m) => [m.metric, WEEKDAYS.map(() => "—")]),
	) as Series;
	return {
		id: "armel",
		name: "Armel",
		initials: "AR",
		urgency: "stable",
		headline: "Parkinson's detection: live Vexo band data only",
		condition: "Parkinson's detection",
		bandOnly: true,
		cells: buildCells("armel", empty, {}),
		events: [],
		schedule: { doses: [], nudges: [] },
		prescriptionVersion: 1,
		adherenceArmed: null,
		wristLog: [],
	};
}

export function buildSeed(): Patient[] {
	return [
		henri(),
		armel(),
		generated({
			id: "margaret-l",
			stage: 2,
			name: "Margaret L.",
			age: 68,
			initials: "ML",
			urgency: "watch",
			headline: "Rising nocturia, mild tremor drift",
			seed: 1101,
			speech: 108,
			engagement: 48,
			tremor: 17,
			dysk: 2.4,
			fallP: 0.15,
			nocturia: 3,
			steps: 4800,
			outdoor: 24,
			bpm: 82,
			hrv: 29,
			firstTremor: 270,
		}),
		generated({
			id: "robert-k",
			stage: 2,
			name: "Robert K.",
			age: 79,
			initials: "RK",
			urgency: "stable",
			headline: "Stable on current regimen",
			seed: 2202,
			speech: 120,
			engagement: 55,
			tremor: 11,
			dysk: 1.2,
			fallP: 0.05,
			nocturia: 1,
			steps: 6200,
			outdoor: 44,
			bpm: 76,
			hrv: 33,
			firstTremor: 305,
		}),
		generated({
			id: "yuki-t",
			stage: 1,
			name: "Yuki T.",
			age: 71,
			initials: "YT",
			urgency: "stable",
			headline: "Good adherence, active outdoors",
			seed: 3303,
			speech: 126,
			engagement: 58,
			tremor: 9,
			dysk: 1.0,
			fallP: 0.03,
			nocturia: 1,
			steps: 7400,
			outdoor: 55,
			bpm: 72,
			hrv: 36,
			firstTremor: 320,
		}),
	];
}

export type { Weekday };
