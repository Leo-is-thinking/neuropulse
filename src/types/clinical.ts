// Shared contracts for NeuroPulse. Owner: Terminal 1. Other terminals import only.

export type StreamId =
	| "voice"
	| "tremor"
	| "balance"
	| "sleep"
	| "mobility"
	| "acoustic"
	| "cardiac"
	| "adherence";

export type Weekday = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
export type DayColumn = Weekday | "Live";
export const WEEKDAYS: Weekday[] = [
	"Mon",
	"Tue",
	"Wed",
	"Thu",
	"Fri",
	"Sat",
	"Sun",
];

export type Flag = "ok" | "warn" | "alert";
export type Urgency = "critical" | "watch" | "stable";

/** One cell of the raw-data table. `id` is the pointer used by [Verify in Raw Data]. */
export interface Cell {
	/** `${patientId}.${day lowercase}.${stream}.${metric}` e.g. henri-m.tue.tremor.tremor_burden */
	id: string;
	patientId: string;
	day: DayColumn;
	stream: StreamId;
	metric: string;
	label: string;
	value: number | string;
	unit: string;
	baseline?: number;
	flag: Flag;
	note?: string;
}

export type EventKind =
	| "tremor_spike"
	| "hr_spike"
	| "acoustic_tag"
	| "speech_drop"
	| "near_fall"
	| "fall"
	| "dose"
	| "pill_water";

export interface TimelineEvent {
	id: string;
	day: DayColumn;
	/** "HH:MM" 24h */
	time: string;
	stream: StreamId;
	kind: EventKind;
	label: string;
	value?: number | string;
	/** Wrist activity classifier hint, e.g. "brushing_pattern". Used to reject false positives. */
	context?: string;
	cellRef?: string;
	/** Live column only: where the event came from. */
	source?: LiveSource;
}

export interface Dose {
	id: string;
	label: string;
	/** "HH:MM" */
	time: string;
	mg: number;
}

export interface Nudge {
	id: string;
	label: string;
	time: string;
	message: string;
}

export interface Schedule {
	doses: Dose[];
	nudges: Nudge[];
}

export interface WristLogEntry {
	at: string;
	command: WristCommand;
	delivered: boolean;
	simulated: boolean;
}

export interface Patient {
	id: string;
	name: string;
	age?: number;
	initials: string;
	urgency: Urgency;
	/** Hoehn & Yahr stage (1–5). Absent while the patient is only being screened. */
	stage?: 1 | 2 | 3 | 4 | 5;
	headline: string;
	/** Clinical track, e.g. "Parkinson's detection". */
	condition?: string;
	/** True: this chart holds ONLY real band data (no seeded/simulated history). */
	bandOnly?: boolean;
	cells: Cell[];
	events: TimelineEvent[];
	schedule: Schedule;
	prescriptionVersion: number;
	adherenceArmed: AdherenceCheck | null;
	wristLog: WristLogEntry[];
}

export type PatientSummary = Pick<
	Patient,
	| "id"
	| "name"
	| "age"
	| "initials"
	| "urgency"
	| "stage"
	| "headline"
	| "condition"
	| "bandOnly"
>;

// ---- Live ingestion ----
export type LiveEventType =
	| "tremor"
	| "heart_rate"
	| "voice"
	| "acoustic"
	| "fall"
	/** generic metric sample: needs `metric` + numeric `value` (any key of METRICS) */
	| "sample"
	/** adherence verification signal: `signal` */
	| "adherence";

export type AdherenceSignal =
	| "led_haptic_cue"
	| "hand_to_mouth"
	| "water_sound"
	| "post_dose_tremor_drop";

/** One point of the live ring buffer (GET /api/live-feed). */
export interface LiveSample {
	/** epoch ms */
	t: number;
	v: number;
}
/** metric key (e.g. "tremor_hz", "tremor_burden", "bpm_peak") -> last samples, oldest first */
export type LiveFeed = Record<string, LiveSample[]>;

/** One tremor episode recorded from the band: frequency, amplitude and wrist orientation. */
export interface TremorEpisode {
	id?: string;
	/** ISO timestamps */
	start: string;
	end: string;
	windows: number;
	/** median / min / max dominant frequency, Hz */
	hz: number;
	hz_min: number;
	hz_max: number;
	/** mean / peak amplitude, g */
	amp: number;
	amp_peak: number;
	/** wrist orientation from mean gravity (band frame), degrees */
	pitch: number;
	roll: number;
	gravity: [number, number, number];
	kind: string;
}

export interface LiveEventInput {
	patientId: string;
	type: LiveEventType;
	/** tremor: dominant frequency Hz. heart_rate: bpm. voice: words/min. */
	value?: number;
	/** tremor only */
	amplitude?: number;
	/** tremor_episode only */
	episode?: TremorEpisode;
	/** acoustic only: Crowd_Stress | Object_Drop_Glass_Break | Pill_Water */
	tag?: string;
	context?: string;
	/** sample only: metric key, e.g. "tremor_burden", "steps", "outdoor_time", "nocturia", "dyskinesia_index" */
	metric?: string;
	/** adherence only */
	signal?: AdherenceSignal;
	/** ISO timestamp; defaults to now */
	ts?: string;
	/** "band" = real Vexo hardware (default). "sim" = demo/backup trigger. */
	source?: LiveSource;
}

export type LiveSource = "band" | "sim";

/** What feeds the app right now. Dataset (7 days) and Live column are independent. */
export interface DataSourceState {
	/** 7-day dataset loaded: the Henri M. demo/backup set. */
	dataset: "henri-demo";
	datasetLoadedAt: string;
	/** Live column intake from the band bridge. */
	live: {
		enabled: boolean;
		lastEventAt: string | null;
		lastSource: LiveSource | null;
		bandEvents: number;
		simEvents: number;
	};
}

// ---- Analysis ----
export interface EntanglementNode {
	stream: StreamId;
	eventId?: string;
	label: string;
}

export interface EntanglementLink {
	from: EntanglementNode;
	to: EntanglementNode;
	relation: string;
	/** 0..1 contribution to confidence */
	weight: number;
}

export interface RejectedFalsePositive {
	eventId: string;
	day: DayColumn;
	time: string;
	label: string;
	reasons: string[];
	cellRefs: string[];
}

export interface Finding {
	text: string;
	cellRefs: string[];
	/** 0..1 reliability of this finding after cross-check */
	reliability?: number;
}

/** One row of the anti-false-positive cross-check matrix. */
export interface CrossCheck {
	event: string;
	primary: string;
	confirmations: string[];
	falsePositiveEliminated: string;
	/** 0..1 */
	reliability: number;
	cellRefs: string[];
}

export type RecommendationAction =
	| { type: "shift_dose"; doseId: string; from: string; to: string }
	| { type: "nudge"; nudgeId: string; time: string; message: string };

export interface Recommendation {
	id: string;
	title: string;
	rationale: string;
	action: RecommendationAction;
}

export interface Analysis {
	patientId: string;
	/** 0..1 */
	confidence: number;
	summary: string;
	links: EntanglementLink[];
	rejected: RejectedFalsePositive[];
	crossChecks: CrossCheck[];
	findings: Finding[];
	recommendations: Recommendation[];
	source: "gemini" | "fallback";
	generatedAt: string;
}

// ---- Actuation ----
export interface AdherenceCheck {
	doseId: string;
	dueAt: string;
	signals: (
		| "led_haptic_cue"
		| "hand_to_mouth"
		| "water_sound"
		| "post_dose_tremor_drop"
	)[];
	confirmed: boolean[];
}

export interface WristCommand {
	patientId: string;
	led: "amber";
	haptic: "double";
	voiceText: string;
	arm: AdherenceCheck;
}

export interface Prescription {
	id: string;
	patientId: string;
	patientName: string;
	version: number;
	issuedAt: string;
	prescriber: string;
	doses: Dose[];
	nudges: Nudge[];
	changes: string[];
}

export interface ActuationResult {
	prescription: Prescription;
	command: WristCommand;
	vexo: { delivered: boolean; simulated: boolean; detail: string };
	voice: { generated: boolean; simulated: boolean; detail: string };
}
