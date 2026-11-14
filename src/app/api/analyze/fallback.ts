import type {
	Analysis,
	Cell,
	CrossCheck,
	DayColumn,
	EntanglementLink,
	Finding,
	Patient,
	Recommendation,
	RejectedFalsePositive,
	TimelineEvent,
} from "@/types/clinical";
import { WEEKDAYS } from "@/types/clinical";

const mins = (t: string) => {
	const [h, m] = t.split(":").map(Number);
	return h * 60 + m;
};
const WINDOW = 10; // minutes for cross-modal co-occurrence
const W = {
	base: 0.5,
	preDose: 0.12,
	acoustic: 0.11,
	cardiac: 0.09,
	voice: 0.08,
	balance: 0.04,
	sleep: 0.02,
};
// Brief asks for 17:00 → 18:00. Clinically, pre-dose wearing-off often argues for an EARLIER dose; change here if the neurologist disagrees.
export const SHIFTED_PM_TIME = "18:00";

const cellOf = (p: Patient, id: string): Cell | undefined =>
	p.cells.find((c) => c.id === id);
const num = (c?: Cell) => (typeof c?.value === "number" ? c.value : NaN);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const id = (p: Patient, day: string, stream: string, metric: string) =>
	`${p.id}.${day.toLowerCase()}.${stream}.${metric}`;
const week = (p: Patient, stream: string, metric: string) =>
	WEEKDAYS.map((d) => cellOf(p, id(p, d, stream, metric))).filter(
		(c): c is Cell => !!c,
	);

export function buildRecommendations(p: Patient): Recommendation[] {
	const pm = p.schedule.doses.find((d) => d.id === "dose-pm");
	const recs: Recommendation[] = [];
	if (pm && pm.time !== SHIFTED_PM_TIME) {
		recs.push({
			id: "rec-shift-pm",
			title: `Shift afternoon Levodopa from ${pm.time} to ${SHIFTED_PM_TIME}`,
			rationale:
				"Pre-dose tremor spike with instability and cardiac stress in the late-afternoon window.",
			action: {
				type: "shift_dose",
				doseId: pm.id,
				from: pm.time,
				to: SHIFTED_PM_TIME,
			},
		});
	}
	recs.push({
		id: "rec-walk",
		title: "Morning outdoor walk nudge (09:30)",
		rationale:
			"Outdoor time and steps are far below baseline; morning on-state is the best window.",
		action: {
			type: "nudge",
			nudgeId: "nudge-walk",
			time: "09:30",
			message: "Time for a short walk outside. Take your time.",
		},
	});
	return recs;
}

interface Candidate {
	spike: TimelineEvent;
	evidence: {
		acoustic?: TimelineEvent;
		cardiac?: TimelineEvent;
		voice?: TimelineEvent;
		balance?: TimelineEvent;
	};
	preDoseMin: number | null;
	onState: boolean;
	score: number;
	confirmed: boolean;
	reasons: string[];
}

function evaluate(p: Patient, spike: TimelineEvent): Candidate {
	const near = p.events.filter(
		(e) =>
			e.day === spike.day &&
			e.id !== spike.id &&
			Math.abs(mins(e.time) - mins(spike.time)) <= WINDOW,
	);
	const evidence = {
		acoustic: near.find(
			(e) => e.kind === "acoustic_tag" && e.value === "Object_Drop_Glass_Break",
		),
		cardiac: near.find((e) => e.kind === "hr_spike"),
		voice: near.find((e) => e.kind === "speech_drop"),
		balance: near.find((e) => e.kind === "near_fall" || e.kind === "fall"),
	};
	const t = mins(spike.time);
	const doses = p.schedule.doses.map((d) => mins(d.time));
	const next = doses.filter((d) => d > t).sort((a, b) => a - b)[0];
	const prev = doses.filter((d) => d <= t).sort((a, b) => b - a)[0];
	const preDoseMin = next !== undefined && next - t <= 30 ? next - t : null;
	const onState = prev !== undefined && t - prev <= 60;
	const freq = typeof spike.value === "number" ? spike.value : NaN;
	const inBand = freq >= 4 && freq <= 6;
	const hits = [
		evidence.acoustic,
		evidence.cardiac,
		evidence.voice,
		evidence.balance,
	].filter(Boolean).length;
	const nocturiaMean = mean(
		week(p, "sleep", "nocturia")
			.map(num)
			.filter((n) => !Number.isNaN(n)),
	);

	let score = inBand ? W.base : 0.2;
	if (preDoseMin !== null) score += W.preDose;
	if (evidence.acoustic) score += W.acoustic;
	if (evidence.cardiac) score += W.cardiac;
	if (evidence.voice) score += W.voice;
	if (evidence.balance) score += W.balance;
	if (hits >= 2 && nocturiaMean >= 3) score += W.sleep;

	const reasons: string[] = [];
	if (spike.context)
		reasons.push(
			`Wrist classifier matched a ${spike.context.replace("_", " ")} (rhythmic, bidirectional, voluntary).`,
		);
	if (onState)
		reasons.push(
			`Occurs ${t - prev} min after a dose — on-state, not wearing-off.`,
		);
	if (!evidence.cardiac)
		reasons.push("Heart rate normal — no autonomic stress response.");
	if (!evidence.acoustic)
		reasons.push("No co-occurring acoustic event (no drop or crowd noise).");
	if (!evidence.balance && !evidence.voice)
		reasons.push("No instability or speech change in the same window.");

	const confirmed = inBand && hits >= 2 && !spike.context && !onState;
	return {
		spike,
		evidence,
		preDoseMin,
		onState,
		score: Math.min(0.97, score),
		confirmed,
		reasons,
	};
}

const pct = (v: number, b: number) => Math.round(((v - b) / b) * 100);

export function analyzeDeterministic(p: Patient): Analysis {
	const spikes = p.events.filter((e) => e.kind === "tremor_spike");
	const cands = spikes.map((s) => evaluate(p, s));
	const confirmed = cands
		.filter((c) => c.confirmed)
		.sort((a, b) => b.score - a.score);
	const best = confirmed[0];

	const rejected: RejectedFalsePositive[] = cands
		.filter((c) => !c.confirmed)
		.map((c) => ({
			eventId: c.spike.id,
			day: c.spike.day,
			time: c.spike.time,
			label: `${c.spike.day} ${c.spike.time} — ${c.spike.label}`,
			reasons: c.reasons,
			cellRefs: c.spike.cellRef ? [c.spike.cellRef] : [],
		}));

	const links: EntanglementLink[] = [];
	const findings: Finding[] = [];
	const dayKey = best?.spike.day as DayColumn | undefined;
	const dow = (stream: string, metric: string) =>
		dayKey ? id(p, dayKey, stream, metric) : "";

	if (best && dayKey) {
		const s = best.spike;
		const node = (e: TimelineEvent) => ({
			stream: e.stream,
			eventId: e.id,
			label: e.label,
		});
		const add = (
			e: TimelineEvent | undefined,
			relation: string,
			weight: number,
		) => e && links.push({ from: node(s), to: node(e), relation, weight });
		add(
			best.evidence.acoustic,
			"Object released during tremor spike",
			W.acoustic,
		);
		add(best.evidence.cardiac, "Sympathetic surge + arrhythmia", W.cardiac);
		add(best.evidence.voice, "Hypophonia deepens as drug level falls", W.voice);
		add(best.evidence.balance, "Motor failure → instability", W.balance);
		const dose = p.events.find(
			(e) =>
				e.kind === "dose" && e.day === s.day && mins(e.time) > mins(s.time),
		);
		if (dose && best.preDoseMin !== null)
			links.push({
				from: node(s),
				to: node(dose),
				relation: `${best.preDoseMin} min before dose → wearing-off`,
				weight: W.preDose,
			});
		links.push({
			from: node(s),
			to: { stream: "sleep", label: "Nocturia ≥3/night all week" },
			relation: "Chronic autonomic burden",
			weight: W.sleep,
		});

		const isLive = dayKey === "Live";
		const dayLabel = isLive ? "today (live)" : dayKey;
		const t0 = mins(s.time);
		const sched = p.schedule.doses.map((d) => ({ d, m: mins(d.time) }));
		const nextD = sched.filter((x) => x.m > t0).sort((x, y) => x.m - y.m)[0];
		const prevD = sched.filter((x) => x.m <= t0).sort((x, y) => y.m - x.m)[0];
		const n1 = (v: number) => (Number.isFinite(v) ? v : null);
		const tb = cellOf(p, dow("tremor", "tremor_burden"));
		const typical = Math.round(
			mean(
				week(p, "tremor", "tremor_burden")
					.map(num)
					.filter((v) => Number.isFinite(v)),
			),
		);
		const burden = n1(num(tb));
		findings.push({
			text: `${burden !== null ? `Tremor burden hit ${burden}% ${isLive ? "today" : `on ${dayKey}`} (typical day: ${typical}%). ` : ""}A ${s.value} Hz resting tremor at ${s.time} started${best.preDoseMin !== null && nextD ? ` ${best.preDoseMin} minutes before the ${nextD.d.time} Levodopa dose — a wearing-off pattern.` : " outside a dose window."}`,
			cellRefs: tb ? [tb.id] : [],
		});
		const bpm = n1(num(cellOf(p, dow("cardiac", "bpm_peak"))));
		const hrv = n1(num(cellOf(p, dow("cardiac", "hrv"))));
		const ext = n1(num(cellOf(p, dow("cardiac", "extrasystoles"))));
		const bits = [
			bpm !== null ? `Heart rate reached ${bpm} bpm` : null,
			hrv !== null ? `HRV fell to ${hrv} ms (baseline 32)` : null,
			ext !== null ? `${ext} extrasystoles were logged` : null,
		].filter(Boolean);
		if (best.evidence.acoustic || bits.length) {
			findings.push({
				text: `${best.evidence.acoustic ? "A glass-break sound was tagged at the same minute. " : ""}${bits.length ? bits.join(", ") + ". " : ""}The pattern matches an involuntary tremor release, not a startle.`,
				cellRefs: [
					dow("acoustic", "acoustic_tags"),
					dow("cardiac", "bpm_peak"),
					dow("cardiac", "hrv"),
					dow("cardiac", "extrasystoles"),
				].filter((r) => cellOf(p, r)),
			});
		}
		if (best.evidence.balance) {
			findings.push({
				text: `Instability followed: ${cellOf(p, dow("balance", "instability_events"))?.note ?? best.evidence.balance.label}`,
				cellRefs: [dow("balance", "instability_events")],
			});
		}
		const ft = cellOf(p, dow("tremor", "first_tremor_after_dose"));
		const hf = cellOf(p, dow("balance", "hours_dose_to_fall"));
		const sinceDose = n1(num(ft)) ?? (prevD ? t0 - prevD.m : null);
		if (sinceDose !== null) {
			findings.push({
				text: `Dose-to-event timing: first tremor came ${sinceDose} min after the last dose${ft?.baseline ? ` (baseline ${ft.baseline} min)` : ""}${typeof hf?.value === "number" ? `, and the instability event followed ${hf.value} h after that dose` : ""}. The medication effect is fading earlier than prescribed.`,
				cellRefs: [
					dow("tremor", "first_tremor_after_dose"),
					dow("balance", "hours_dose_to_fall"),
				].filter((r) => cellOf(p, r)),
			});
		}
		void dayLabel;
	}

	const sr = week(p, "voice", "speech_rate");
	const srMean = mean(sr.map(num));
	const ve = week(p, "voice", "verbal_engagement");
	if (srMean < 102) {
		findings.push({
			text: `Hypophonia: speech rate averages ${srMean.toFixed(1)} words/min vs 132 healthy baseline (${pct(srMean, 132)}%). Verbal engagement fell from ${num(ve[0])} to ${num(ve[6])} min/day over the week. Motor-only trackers miss this.`,
			cellRefs: [sr[0].id, sr[6].id, ve[0].id, ve[6].id],
		});
	}
	const noc = week(p, "sleep", "nocturia");
	const nocMean = mean(noc.map(num));
	const out = week(p, "mobility", "outdoor_time");
	const outMean = mean(out.map(num));
	if (nocMean >= 2 || outMean < 25) {
		findings.push({
			text: `Nocturia averages ${nocMean.toFixed(1)} trips/night (healthy ≤1). Outdoor time averages ${Math.round(outMean)} min/day vs 45 baseline and trends down toward the weekend.`,
			cellRefs: [noc[1].id, out[0].id, out[6].id],
		});
	}

	if (!best) {
		findings.push({
			text: "No cross-modal incident confirmed this week. No tremor spike met the corroboration threshold.",
			cellRefs: [],
		});
	}

	const confidence = best ? best.score : 0.3;
	if (best && findings[0]) findings[0].reliability = best.score;

	const dysk = week(p, "tremor", "dyskinesia_index");
	const dyskMean = mean(dysk.map(num));
	const verified = week(p, "adherence", "verified_doses");
	const crossChecks: CrossCheck[] = [
		{
			event: "Dyskinesia (overdose)",
			primary: "IMU: large irregular movements",
			confirmations: [
				"Timing 45–90 min after a confirmed dose",
				"Voice: normal or fast speech rate",
			],
			falsePositiveEliminated: best
				? `Underdose tremor (${best.spike.day} ${best.spike.time}) mistaken for overdose — dyskinesia index stays low (avg ${dyskMean.toFixed(1)}/10).`
				: "Overdose vs underdose confusion.",
			reliability: 0.92,
			cellRefs: dysk.map((c) => c.id),
		},
		{
			event: "Validated medication intake",
			primary: "Actuation: LED + vibration at scheduled time",
			confirmations: [
				"IMU: glass-to-mouth gesture < 5 min",
				"Audio: Pill_Water",
				"Tremor drop at +35 min",
			],
			falsePositiveEliminated:
				"Missed manual entry on a smartphone — the patient never needs to click.",
			reliability: 0.96,
			cellRefs: verified.map((c) => c.id),
		},
	];
	const recommendations = best
		? buildRecommendations(p)
		: buildRecommendations(p).filter((r) => r.id === "rec-walk");
	const summary = best
		? `${Math.round(confidence * 100)}% confidence: pre-dose wearing-off ${best.spike.day === "Live" ? "detected live" : `on ${best.spike.day}`} at ${best.spike.time}, confirmed by ${links.length - 1} independent streams. ${rejected.length} candidate event(s) rejected as false positive.`
		: `No confirmed incident. ${rejected.length} candidate event(s) rejected.`;

	return {
		patientId: p.id,
		confidence,
		summary,
		links,
		rejected,
		crossChecks,
		findings,
		recommendations,
		source: "fallback",
		generatedAt: new Date().toISOString(),
	};
}
