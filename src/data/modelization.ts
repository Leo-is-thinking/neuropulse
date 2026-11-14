// Demo dataset for the Modelization tab (Henri M.).
// Values are simulated to stay consistent with patientsSeed.ts; real source = Vexo band streams.

export interface TremorHighlight {
	id: string;
	day: string;
	/** Window shown in the replay, "HH:MM". */
	start: string;
	end: string;
	/** Time of the strongest tremor. */
	peak: string;
	hz: number;
	/** Wrist acceleration amplitude at peak, in g. */
	ampG: number;
	/** 0–10 score (amplitude-derived). */
	intensity: number;
	title: string;
	/** Markers shown on the replay timeline. */
	marks: { time: string; label: string }[];
	/** Observations, `**bold**` marks key words. */
	notes: string[];
}

const PEAKS: Record<string, string> = {
	Mon: "16:50",
	Tue: "16:40",
	Wed: "16:35",
	Thu: "16:55",
	Fri: "16:45",
	Sat: "18:10",
	Sun: "16:40",
};
const DAY_NAMES: Record<string, string> = {
	Mon: "Monday",
	Tue: "Tuesday",
	Wed: "Wednesday",
	Thu: "Thursday",
	Fri: "Friday",
	Sat: "Saturday",
	Sun: "Sunday",
};
const m2t = (m: number) =>
	`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const t2m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

/** Builds the replayable episode of a day from its dashboard values (tremor intensity 0-10, tremor time %). */
export function episodeFor(
	day: string,
	intensity: number,
	burden: number,
): TremorHighlight {
	const peak = PEAKS[day] ?? "16:40";
	const start = t2m(peak) - 10;
	const hz = Math.round((4.8 + (intensity / 10) * 0.8) * 10) / 10;
	const ampG = Math.round((intensity / 20) * 100) / 100;
	const marks: TremorHighlight["marks"] = [];
	const dose = t2m("17:00");
	if (dose >= start && dose <= start + 30)
		marks.push({ time: "17:00", label: "Dose due" });
	let notes: string[];
	if (day === "Tue") {
		marks.unshift(
			{ time: "16:34", label: "Speech slows" },
			{ time: "16:40", label: "Glass drop" },
			{ time: "16:42", label: "Near-fall" },
		);
		notes = [
			`Tremor **builds over about 10 minutes** before reaching **${ampG} g at ${hz} Hz**.`,
			"Speech slows at 16:34 and the glass slips at 16:40: **the same episode affects voice and grip**.",
			"It starts **30 minutes before the 17:00 dose**, a typical wearing-off timing.",
		];
	} else {
		const gap = t2m(peak) - dose;
		const timing =
			gap < 0
				? `Peaks **${-gap} minutes before the 17:00 dose**.`
				: `Peaks **${gap} minutes after the 17:00 dose**.`;
		if (day === "Sat") marks.push({ time: peak, label: "Crowd stress" });
		notes = [
			`**${intensity}/10** intensity, **${ampG} g at ${hz} Hz**. Tremor present **${burden}% of waking time** that day.`,
			timing,
			intensity >= 4
				? "Stronger than a typical day."
				: "Close to a typical day for this patient.",
		];
	}
	return {
		id: day,
		day: DAY_NAMES[day],
		start: m2t(start),
		end: m2t(start + 30),
		peak,
		hz,
		ampG,
		intensity,
		title: "",
		marks,
		notes,
	};
}

/** Tremor episodes per hour of day, last 4 weeks (index 0 = 06:00). */
export const TREMOR_BY_HOUR: { hour: number; episodes: number }[] = [
	[6, 1],
	[7, 2],
	[8, 1],
	[9, 1],
	[10, 2],
	[11, 3],
	[12, 5],
	[13, 2],
	[14, 2],
	[15, 4],
	[16, 14],
	[17, 9],
	[18, 6],
	[19, 3],
	[20, 2],
	[21, 1],
].map(([hour, episodes]) => ({ hour, episodes }));

/** Speech rate (words / min) by hour of day, last 4 weeks, mean. */
export const SPEECH_BY_HOUR: { hour: number; rate: number }[] = [
	[7, 71],
	[8, 79],
	[9, 91],
	[10, 98],
	[11, 96],
	[12, 89],
	[13, 94],
	[14, 95],
	[15, 88],
	[16, 74],
	[17, 77],
	[18, 78],
	[19, 83],
	[20, 76],
	[21, 71],
].map(([hour, rate]) => ({ hour, rate }));

export const DOSE_HOURS = [8, 12.5, 17];

export interface VoiceSample {
	id: string;
	/** Short label for the picker. */
	label: string;
	when: string;
	/** What the patient was saying, from the band microphone. */
	said: string;
	/** words / min of continuous speech */
	rate: number;
	/** Share of the recording spent in silence, 0–1. */
	pauseShare: number;
	/** Average volume, dB. */
	volumeDb: number;
	/** How much the volume drops over a sentence, 0–1. */
	fade: number;
}

export const VOICE_BASELINE = 132;

/** Reference recordings from the past. Different sentences on purpose: daily speech is never the same phrase twice. */
export const VOICE_REFERENCES: VoiceSample[] = [
	{
		id: "m6",
		label: "6 months ago",
		when: "Thursday 10:12, 6 months ago",
		said: "I called my daughter this morning, she is coming on Sunday with the kids.",
		rate: 118,
		pauseShare: 0.18,
		volumeDb: 64,
		fade: 0.1,
	},
	{
		id: "w3",
		label: "3 weeks ago",
		when: "Monday 10:40, 3 weeks ago",
		said: "The doctor wants to see me again, I need to find a time that works.",
		rate: 97,
		pauseShare: 0.29,
		volumeDb: 61,
		fade: 0.25,
	},
];

const DAY_VOICE: Record<string, { at: string; said: string }> = {
	Mon: {
		at: "09:50",
		said: "I slept badly again, I will have coffee and sit by the window.",
	},
	Tue: {
		at: "16:34",
		said: "Could you bring me a glass of water, my hands are not steady.",
	},
	Wed: {
		at: "11:20",
		said: "The neighbour brought bread, I told her to come in for a moment.",
	},
	Thu: {
		at: "12:50",
		said: "I got stuck at the doorway again, my feet would not move.",
	},
	Fri: {
		at: "10:05",
		said: "We are going to the market later, if the weather stays dry.",
	},
	Sat: {
		at: "18:20",
		said: "There were too many people at the shop, I wanted to leave.",
	},
	Sun: {
		at: "15:30",
		said: "My son phoned, he will visit next week with the grandchildren.",
	},
};

/** Recording of a day, derived from its dashboard speech rate (words/min). */
export function voiceForDay(day: string, rate: number): VoiceSample {
	const t = Math.min(1, Math.max(0, (118 - rate) / (118 - 67)));
	const d = DAY_VOICE[day] ?? DAY_VOICE.Tue;
	return {
		id: day,
		label: DAY_NAMES[day],
		when: `${DAY_NAMES[day]} ${d.at}`,
		said: d.said,
		rate,
		pauseShare: Math.round((0.18 + t * 0.28) * 100) / 100,
		volumeDb: Math.round(64 - 8 * t),
		fade: Math.round((0.1 + t * 0.45) * 100) / 100,
	};
}

/** Observations across 4 weeks. `**bold**` marks key words. */
export const PATTERN_NOTES: string[] = [
	"**14 of 52** tremor episodes fall between **16:00 and 17:00**, three times any other hour. Same window on Tuesday, Thursday and Saturday.",
	"Speech is slowest **at wake-up** (**71** words/min at 07:10 against **98** at 10:00) and again **before the 17:00 dose** (74).",
	"Both dips sit at the **end of a dose interval**, when levodopa is wearing off.",
];

/** Dose schedule vs doses actually logged (pill-box + water sound), simulated for Henri M. */
export const DOSE_LOG = [
	{ label: "Morning", prescribed: "08:00", taken: "07:10" },
	{ label: "Midday", prescribed: "12:30", taken: "11:25" },
	{ label: "Afternoon", prescribed: "17:00", taken: "15:45" },
];

/** Cross-analysis conclusion: what no single stream shows. `**bold**` marks key words. */
export const DIAGNOSIS = {
	title: "Probable cause of the 17:00 tremor episodes",
	steps: [
		{
			stream: "Tremor",
			text: "**14 of 52** episodes in 4 weeks fall between **16:00 and 17:00**, up to **0.3 g at 5.6 Hz**.",
		},
		{
			stream: "Doses",
			text: "Pills are taken **45 to 65 minutes early** on 3 of 4 days (midday **11:25** for 12:30, afternoon **15:45** for 17:00).",
		},
		{
			stream: "Voice",
			text: "Speech slows to **74 words/min** at 16:30, the same dip as before the episode.",
		},
		{
			stream: "Context",
			text: "Heart rate rises to **96 bpm** and noise reaches **78 dB** on the worst days (crowd, Saturday).",
		},
	],
	conclusion:
		"Early doses leave **a gap of about 4 hours before the 17:00 dose is due**. Levodopa **wears off at 16:00-17:00**, and stress makes it worse. A tremor count alone shows the peak, not the reason.",
	actions: [
		"Re-explain **dose timing** to the patient and carer: midday dose no earlier than 12:15.",
		"Consider a **small afternoon dose at 15:30** or a slow-release form, at the clinician's discretion.",
		"Keep the bracelet reminder at **16:45** and re-check the 16:00-17:00 window in 2 weeks.",
	],
};
