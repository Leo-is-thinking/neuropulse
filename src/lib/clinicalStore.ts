import { buildSeed, cellId, flagFor, METRICS } from "@/data/patientsSeed";
import type {
	AdherenceCheck,
	AdherenceSignal,
	Cell,
	DataSourceState,
	LiveEventInput,
	LiveFeed,
	Patient,
	PatientSummary,
	Prescription,
	Recommendation,
	TimelineEvent,
	WristCommand,
} from "@/types/clinical";

// HMR-safe singleton: survives Next dev module reloads.
const g = globalThis as unknown as {
	__neuropulse?: Map<string, Patient>;
	__neuropulseSrc?: DataSourceState;
};
const freshSource = (): DataSourceState => ({
	dataset: "henri-demo",
	datasetLoadedAt: new Date().toISOString(),
	live: {
		enabled: true,
		lastEventAt: null,
		lastSource: null,
		bandEvents: 0,
		simEvents: 0,
	},
});
const src = (): DataSourceState => (g.__neuropulseSrc ??= freshSource());
const db = (): Map<string, Patient> => {
	if (!g.__neuropulse)
		g.__neuropulse = new Map(buildSeed().map((p) => [p.id, p]));
	return g.__neuropulse;
};

const FEED_MAX = 120;
const evLast = new Map<string, number>();
const gf = globalThis as unknown as {
	__neuropulseFeed?: Map<string, LiveFeed>;
};
const feeds = () => (gf.__neuropulseFeed ??= new Map<string, LiveFeed>());

/** Marks one adherence signal; when all 4 are in, counts a verified dose in the Live column. */
function confirmSignal(
	p: Patient,
	signal: AdherenceSignal,
	touched: Cell[],
	feed: (m: string, v: number) => void,
) {
	const arm = p.adherenceArmed;
	if (!arm) return;
	const i = arm.signals.indexOf(signal);
	if (i < 0 || arm.confirmed[i]) return;
	arm.confirmed[i] = true;
	feed(`adherence_${signal}`, 1);
	if (arm.confirmed.every(Boolean)) {
		const c = p.cells.find(
			(x) => x.id === cellId(p.id, "Live", "adherence", "verified_doses"),
		);
		if (c) {
			c.value = (typeof c.value === "number" ? c.value : 0) + 1;
			c.flag = "ok";
			c.note = `Dose ${arm.doseId} verified: cue + gesture + water + tremor drop`;
			touched.push(c);
		}
		feed("verified_doses", typeof c?.value === "number" ? c.value : 1);
	}
}

const clone = <T>(v: T): T => structuredClone(v);

export const clinicalStore = {
	list(): PatientSummary[] {
		return [...db().values()].map(
			({ id, name, age, initials, urgency, stage, headline }) => ({
				id,
				name,
				age,
				initials,
				urgency,
				stage,
				headline,
			}),
		);
	},

	get(id: string): Patient | undefined {
		const p = db().get(id);
		return p ? clone(p) : undefined;
	},

	/** Reload the full Henri demo/backup dataset (7 days + empty Live column). */
	reset(): void {
		feeds().clear();
		evLast.clear();
		g.__neuropulse = new Map(buildSeed().map((p) => [p.id, p]));
		g.__neuropulseSrc = freshSource();
	},

	source(): DataSourceState {
		return clone(src());
	},

	/** Pause/resume Live intake (bridge events are rejected while disabled). */
	setLive(enabled: boolean): DataSourceState {
		src().live.enabled = enabled;
		return clone(src());
	},

	/** Wipe ONLY the Live column + live events + live feed of a patient. 7-day dataset untouched. */
	clearLive(patientId: string): { cleared: number } | { error: string } {
		const p = db().get(patientId);
		if (!p) return { error: "patient_not_found" };
		const fresh = buildSeed().find((x) => x.id === patientId)!;
		let cleared = 0;
		for (const c of p.cells) {
			if (c.day !== "Live") continue;
			const f = fresh.cells.find((x) => x.id === c.id)!;
			Object.assign(c, {
				value: f.value,
				unit: f.unit,
				flag: f.flag,
				note: f.note,
			});
			cleared++;
		}
		p.events = p.events.filter((e) => e.day !== "Live");
		feeds().delete(patientId);
		src().live = {
			...src().live,
			lastEventAt: null,
			lastSource: null,
			bandEvents: 0,
			simEvents: 0,
		};
		return { cleared };
	},

	/** Live ring buffers for the dashboard sparklines. */
	feed(patientId: string): LiveFeed | undefined {
		if (!db().has(patientId)) return undefined;
		return clone(feeds().get(patientId) ?? {});
	},

	/**
	 * Writes into the Live column + feed (+ timeline when the sample is a clinical event).
	 * `event` is null for plain telemetry (resting HR, sub-threshold tremor...).
	 */
	pushLive(
		input: LiveEventInput,
	): { cells: Cell[]; event: TimelineEvent | null } | { error: string } {
		const p = db().get(input.patientId);
		if (!p) return { error: "patient_not_found" };
		if (!src().live.enabled) return { error: "live_disabled" };
		const ts = input.ts ? new Date(input.ts) : new Date();
		if (Number.isNaN(ts.getTime())) return { error: "invalid_ts" };
		const time = `${String(ts.getHours()).padStart(2, "0")}:${String(ts.getMinutes()).padStart(2, "0")}`;
		const live = (stream: Cell["stream"], metric: string) =>
			p.cells.find((c) => c.id === cellId(p.id, "Live", stream, metric));
		const n = p.events.length + 1;
		const base = {
			id: `${p.id}.live${n}`,
			day: "Live" as const,
			time,
			context: input.context,
		};
		const touched: Cell[] = [];
		const feed = (metric: string, v: number) => {
			const f = feeds();
			const m = f.get(p.id) ?? {};
			const arr = (m[metric] ??= []);
			arr.push({ t: Date.now(), v });
			if (arr.length > FEED_MAX) arr.splice(0, arr.length - FEED_MAX);
			f.set(p.id, m);
		};
		const setNum = (stream: Cell["stream"], metric: string, v: number) => {
			const c = live(stream, metric);
			if (!c) return null;
			const def = METRICS.find(
				(m) => m.stream === stream && m.metric === metric,
			);
			c.value = v;
			if (def) c.flag = flagFor(def, v);
			touched.push(c);
			feed(metric, v);
			return c;
		};
		let event: TimelineEvent | null = null;

		switch (input.type) {
			case "tremor": {
				if (typeof input.value !== "number")
					return { error: "value_required_hz" };
				const amp = input.amplitude ?? 0;
				const c = live("tremor", "tremor_burden")!;
				c.note = `${input.value.toFixed(1)} Hz · ${amp.toFixed(2)} g`;
				if (!touched.includes(c)) touched.push(c);
				feed("tremor_hz", input.value);
				feed("tremor_amp", amp);
				const ti = live("tremor", "tremor_intensity");
				if (ti) {
					const score = Math.round(Math.min(10, amp * 20) * 10) / 10;
					const def = METRICS.find((m) => m.metric === "tremor_intensity");
					ti.value = score;
					if (def) ti.flag = flagFor(def, score);
					if (!touched.includes(ti)) touched.push(ti);
					feed("tremor_intensity", score);
				}
				if (input.value >= 4 && input.value <= 6 && amp >= 0.05) {
					event = {
						...base,
						stream: "tremor",
						kind: "tremor_spike",
						label: `Resting tremor ${input.value.toFixed(1)} Hz`,
						value: input.value,
						cellRef: c.id,
					};
				}
				break;
			}
			case "heart_rate": {
				if (typeof input.value !== "number")
					return { error: "value_required_bpm" };
				const c = setNum("cardiac", "bpm_peak", input.value)!;
				if (input.value >= 90) {
					event = {
						...base,
						stream: "cardiac",
						kind: "hr_spike",
						label: `HR ${input.value} bpm`,
						value: input.value,
						cellRef: c.id,
					};
				}
				break;
			}
			case "voice": {
				if (typeof input.value !== "number")
					return { error: "value_required_rate" };
				const c = setNum("voice", "speech_rate", input.value)!;
				if (input.value < 100) c.flag = "alert";
				else if (input.value < 115) c.flag = "warn";
				if (input.value < 100) {
					event = {
						...base,
						stream: "voice",
						kind: "speech_drop",
						label: `Speech rate ${input.value} words/min`,
						value: input.value,
						cellRef: c.id,
					};
				}
				break;
			}
			case "acoustic": {
				if (!input.tag) return { error: "tag_required" };
				const c = live("acoustic", "acoustic_tags")!;
				c.value = input.tag;
				c.flag =
					input.tag === "Object_Drop_Glass_Break"
						? "alert"
						: input.tag === "Crowd_Stress"
							? "warn"
							: "ok";
				touched.push(c);
				feed("acoustic_event", 1);
				event = {
					...base,
					stream: "acoustic",
					kind: input.tag === "Pill_Water" ? "pill_water" : "acoustic_tag",
					label: input.tag,
					value: input.tag,
					cellRef: c.id,
				};
				if (input.tag === "Pill_Water")
					confirmSignal(p, "water_sound", touched, feed);
				break;
			}
			case "fall": {
				const c = live("balance", "instability_events")!;
				c.value = (typeof c.value === "number" ? c.value : 0) + 1;
				c.flag = flagFor(
					METRICS.find((m) => m.metric === "instability_events")!,
					c.value,
				);
				touched.push(c);
				feed("instability_events", c.value);
				event = {
					...base,
					stream: "balance",
					kind: input.context === "fall" ? "fall" : "near_fall",
					label:
						input.context === "fall"
							? "Fall (impact detected)"
							: "Near-fall stumble",
					cellRef: c.id,
				};
				break;
			}
			case "sample": {
				const def = METRICS.find((m) => m.metric === input.metric);
				if (!def || typeof input.value !== "number")
					return { error: "metric_and_numeric_value_required" };
				setNum(def.stream, def.metric, input.value);
				break;
			}
			case "adherence": {
				if (!input.signal) return { error: "signal_required" };
				if (!p.adherenceArmed) return { error: "adherence_not_armed" };
				confirmSignal(p, input.signal, touched, feed);
				break;
			}
			default:
				return { error: "unknown_type" };
		}
		if (
			event &&
			["tremor_spike", "hr_spike", "speech_drop"].includes(event.kind)
		) {
			// telemetry repeats every second: keep one timeline event per 30 s per kind
			const k = `${p.id}.${event.kind}`;
			const nowMs = Date.now();
			if (nowMs - (evLast.get(k) ?? 0) < 30_000) event = null;
			else evLast.set(k, nowMs);
		}
		const source = input.source === "sim" ? "sim" : "band";
		if (event) {
			event.source = source;
			p.events.push(event);
		}
		const l = src().live;
		l.lastEventAt = new Date().toISOString();
		l.lastSource = source;
		if (source === "band") l.bandEvents++;
		else l.simEvents++;
		return { cells: clone(touched), event: event ? clone(event) : null };
	},

	/** Applies accepted recommendations to the schedule. Returns the prescription + wrist command. */
	applyRecommendations(
		patientId: string,
		recs: Recommendation[],
	):
		| { prescription: Prescription; command: WristCommand; changes: string[] }
		| { error: string } {
		const p = db().get(patientId);
		if (!p) return { error: "patient_not_found" };
		const changes: string[] = [];
		let armDoseId = p.schedule.doses[0]?.id ?? "";
		let armTime = "";

		for (const r of recs) {
			const a = r.action;
			if (a.type === "shift_dose") {
				const d = p.schedule.doses.find((x) => x.id === a.doseId);
				if (!d) return { error: `dose_not_found:${a.doseId}` };
				changes.push(`${d.label} ${d.mg} mg: ${d.time} → ${a.to}`);
				d.time = a.to;
				armDoseId = d.id;
				armTime = a.to;
			} else {
				p.schedule.nudges = p.schedule.nudges.filter((n) => n.id !== a.nudgeId);
				p.schedule.nudges.push({
					id: a.nudgeId,
					label: "Outdoor walk",
					time: a.time,
					message: a.message,
				});
				changes.push(`Nudge added ${a.time}: ${a.message}`);
			}
		}
		if (!changes.length) return { error: "no_changes" };

		p.schedule.doses.sort((x, y) => x.time.localeCompare(y.time));
		p.prescriptionVersion += 1;

		const arm: AdherenceCheck = {
			doseId: armDoseId,
			dueAt:
				armTime || p.schedule.doses.find((d) => d.id === armDoseId)?.time || "",
			signals: [
				"led_haptic_cue",
				"hand_to_mouth",
				"water_sound",
				"post_dose_tremor_drop",
			],
			confirmed: [false, false, false, false],
		};
		arm.confirmed[0] = true; // LED cue is sent as part of this actuation
		p.adherenceArmed = arm;

		const prescription: Prescription = {
			id: `rx-${p.id}-v${p.prescriptionVersion}`,
			patientId: p.id,
			patientName: p.name,
			version: p.prescriptionVersion,
			issuedAt: new Date().toISOString(),
			prescriber: "Neurologist (demo)",
			doses: clone(p.schedule.doses),
			nudges: clone(p.schedule.nudges),
			changes,
		};
		const command: WristCommand = {
			patientId: p.id,
			led: "amber",
			haptic: "double",
			voiceText: `Hello ${p.name.split(" ")[0]}. Your medication time has changed. Next dose at ${arm.dueAt}. Please take it with a glass of water.`,
			arm,
		};
		return { prescription, command, changes };
	},

	logWrist(patientId: string, entry: Patient["wristLog"][number]): void {
		db().get(patientId)?.wristLog.push(entry);
	},
};
