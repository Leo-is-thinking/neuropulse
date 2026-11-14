"use client";

import {
	Activity,
	ArrowLeft,
	ArrowRight,
	CalendarClock,
	Loader2,
	Mic,
	PenLine,
	Pill,
	Radio,
	Square,
	Stethoscope,
	WifiOff,
} from "lucide-react";
import Link from "next/link";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import ClinicalReportView from "@/components/ClinicalReportView";
import EntanglementView from "@/components/EntanglementView";
import { VERIFY_CELL_EVENT } from "@/components/RawDataTables";
import SecureGate from "@/components/SecureGate";
import StreamPanels from "@/components/StreamPanels";
import { CHECKUPS } from "@/data/checkups";
import { ROSTER } from "@/data/rosterCatalog";
import { renderBold } from "@/lib/renderBold";
import type { ActuationResult, Analysis, Patient } from "@/types/clinical";

const POLL_MS = 2000;
const URGENCY_RING = {
	critical: "ring-red-500 animate-pulse",
	watch: "ring-amber-400",
	stable: "ring-emerald-500",
} as const;

interface SpeechRec {
	lang: string;
	continuous: boolean;
	interimResults: boolean;
	onresult: (e: {
		resultIndex: number;
		results: ArrayLike<
			ArrayLike<{ transcript: string }> & { isFinal: boolean }
		>;
	}) => void;
	onend: () => void;
	onerror: () => void;
	start: () => void;
	stop: () => void;
}

function DoseCurve({
	points,
	unit,
}: {
	points: { label: string; mg: number }[];
	unit: string;
}) {
	const W = 600;
	const H = 210;
	const pad = { l: 64, r: 64, t: 40, b: 64 };
	const mgs = points.map((p) => p.mg);
	const span = Math.max(1, Math.max(...mgs) - Math.min(...mgs));
	const lo = Math.min(...mgs) - span * 0.3;
	const hi = Math.max(...mgs) + span * 0.3;
	const x = (i: number) =>
		pad.l + (i / Math.max(points.length - 1, 1)) * (W - pad.l - pad.r);
	const y = (v: number) =>
		pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
	// Dose is a step function: it changes at a visit, then stays flat.
	let d = `M${x(0)},${y(points[0].mg)}`;
	for (let i = 1; i < points.length; i++) d += ` H${x(i)} V${y(points[i].mg)}`;
	return (
		<svg
			viewBox={`0 0 ${W} ${H}`}
			className="h-auto w-full"
			role="img"
			aria-label="Dose over previous check-ups"
		>
			<line
				x1={pad.l - 20}
				x2={W - pad.r + 20}
				y1={H - pad.b + 14}
				y2={H - pad.b + 14}
				stroke="#e2e8f0"
			/>
			<path
				d={d}
				fill="none"
				stroke="#2563eb"
				strokeWidth="3"
				strokeLinejoin="round"
			/>
			{points.map((p, i) => {
				const [l1, l2] = p.label.split("|");
				return (
					<g key={`${p.label}-${i}`}>
						<circle
							cx={x(i)}
							cy={y(p.mg)}
							r="6"
							fill="#fff"
							stroke="#2563eb"
							strokeWidth="3"
						/>
						<text
							x={x(i)}
							y={y(p.mg) - 14}
							textAnchor="middle"
							fontSize="18"
							fontWeight="700"
							fill="#0f172a"
						>
							{p.mg} {unit}
						</text>
						<text
							x={x(i)}
							y={H - pad.b + 36}
							textAnchor="middle"
							fontSize="15"
							fontWeight="600"
							fill="#334155"
						>
							{l1}
						</text>
						{l2 && (
							<text
								x={x(i)}
								y={H - pad.b + 54}
								textAnchor="middle"
								fontSize="13"
								fill="#64748b"
							>
								({l2})
							</text>
						)}
					</g>
				);
			})}
		</svg>
	);
}

function MedCard({
	name,
	unit,
	doses,
	history,
}: {
	name: string;
	unit: string;
	doses: { time: string; mg: number }[];
	history: { label: string; mg: number }[] | null;
}) {
	const total = doses.reduce((n, x) => n + x.mg, 0);
	return (
		<section
			className="rounded-xl border border-slate-200 bg-white p-5"
			aria-label={`${name} treatment`}
		>
			<h3 className="flex items-center gap-3 text-base font-bold text-slate-700">
				<span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white">
					<Pill className="h-6 w-6" aria-hidden />
				</span>
				Medication
			</h3>
			<p className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
				{name}
			</p>
			<p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
				Intake times
			</p>
			<p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">
				{doses.map((x) => x.time).join("  ·  ")}
			</p>
			<p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
				Dose
			</p>
			<p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">
				{total}
				<span className="ml-1.5 text-lg font-semibold text-slate-600">
					{unit} / day
				</span>
			</p>
			{history && (
				<div className="mt-4">
					<DoseCurve points={history} unit={unit} />
				</div>
			)}
		</section>
	);
}

function PatientCockpit({ params }: { params: Promise<{ id: string }> }) {
	const { id } = use(params);
	const [patient, setPatient] = useState<Patient | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [online, setOnline] = useState(true);
	const [analysis, setAnalysis] = useState<Analysis | null>(null);
	const [analyzing, setAnalyzing] = useState(false);
	const [highlight, setHighlight] = useState<string | null>(null);
	const [assessment, setAssessment] = useState("");
	const [savedNotes, setSavedNotes] = useState<string | null>(null);
	const [noteSaved, setNoteSaved] = useState(false);
	const [flash, setFlash] = useState<Set<string>>(new Set());
	const prevCells = useRef<Map<string, string>>(new Map());
	const resultRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		try {
			setSavedNotes(localStorage.getItem(`np-notes-${id}`));
		} catch {}
	}, [id]);

	const [listening, setListening] = useState(false);
	const [micOk, setMicOk] = useState(false);
	const recRef = useRef<{ stop: () => void } | null>(null);
	useEffect(() => {
		const w = window as unknown as Record<string, unknown>;
		setMicOk(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
	}, []);
	const toggleMic = () => {
		if (listening) {
			recRef.current?.stop();
			return;
		}
		const w = window as unknown as Record<string, new () => SpeechRec>;
		const Rec = w.SpeechRecognition || w.webkitSpeechRecognition;
		if (!Rec) return;
		const r = new Rec();
		r.lang = "en-US";
		r.continuous = true;
		r.interimResults = false;
		r.onresult = (e: {
			resultIndex: number;
			results: ArrayLike<
				ArrayLike<{ transcript: string }> & { isFinal: boolean }
			>;
		}) => {
			let t = "";
			for (let i = e.resultIndex; i < e.results.length; i++)
				if (e.results[i].isFinal) t += e.results[i][0].transcript;
			if (t.trim())
				setAssessment(
					(a) => `${a}${a && !a.endsWith(" ") ? " " : ""}${t.trim()}`,
				);
		};
		r.onend = () => setListening(false);
		r.onerror = () => setListening(false);
		recRef.current = r;
		r.start();
		setListening(true);
	};

	const saveNotes = () => {
		const t = assessment.trim();
		if (!t) return;
		try {
			localStorage.setItem(`np-notes-${id}`, t);
		} catch {}
		setSavedNotes(t);
		setNoteSaved(true);
		setTimeout(() => setNoteSaved(false), 2500);
	};

	const load = useCallback(async () => {
		try {
			const res = await fetch(`/api/patients/${id}`, { cache: "no-store" });
			if (res.status === 404) return setError("Patient not found");
			if (!res.ok) throw new Error(String(res.status));
			const p = (await res.json()) as Patient;
			// detect Live-column changes → flash
			const changed = new Set<string>();
			const next = new Map<string, string>();
			for (const c of p.cells) {
				const sig = `${c.value}|${c.flag}`;
				next.set(c.id, sig);
				if (
					c.day === "Live" &&
					prevCells.current.size &&
					prevCells.current.get(c.id) !== sig
				)
					changed.add(c.id);
			}
			prevCells.current = next;
			if (changed.size) {
				setFlash(changed);
				setTimeout(() => setFlash(new Set()), 1800);
			}
			setPatient(p);
			setOnline(true);
		} catch {
			setOnline(false);
		}
	}, [id]);

	useEffect(() => {
		load();
		const t = setInterval(load, POLL_MS);
		const onLive = () => load();
		window.addEventListener("neuropulse:live-event", onLive); // optional push from Terminal 2
		return () => {
			clearInterval(t);
			window.removeEventListener("neuropulse:live-event", onLive);
		};
	}, [load]);

	// [Verify in Raw Data] → highlight + scroll to the cell
	const verify = useCallback((cellId: string) => {
		setHighlight(null);
		requestAnimationFrame(() => setTimeout(() => setHighlight(cellId), 60));
		setTimeout(() => setHighlight((h) => (h === cellId ? null : h)), 5000);
	}, []);

	useEffect(() => {
		const h = (e: Event) =>
			verify((e as CustomEvent<{ cellId: string }>).detail.cellId);
		window.addEventListener(VERIFY_CELL_EVENT, h);
		const m = window.location.hash.match(/^#cell=(.+)$/);
		if (m) verify(decodeURIComponent(m[1]));
		return () => window.removeEventListener(VERIFY_CELL_EVENT, h);
	}, [verify]);

	const apply = useCallback(
		async (recIds: string[]): Promise<ActuationResult> => {
			const res = await fetch("/api/actuate-wrist", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ patientId: id, recommendationIds: recIds }),
			});
			if (!res.ok) throw new Error(`actuate-wrist ${res.status}`);
			const result = (await res.json()) as ActuationResult;
			load();
			return result;
		},
		[id, load],
	);

	const synthesize = async () => {
		setAnalyzing(true);
		setAnalysis(null);
		requestAnimationFrame(() =>
			resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
		);
		try {
			const res = await fetch("/api/analyze", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ patientId: id }),
			});
			if (!res.ok) throw new Error(String(res.status));
			setAnalysis((await res.json()) as Analysis);
		} catch {
			setError("Diagnosis failed. Please retry.");
			setTimeout(() => setError(null), 4000);
		} finally {
			setAnalyzing(false);
		}
	};

	if (error === "Patient not found")
		return (
			<main className="mx-auto max-w-3xl p-10">
				<p className="text-slate-700">Patient not found.</p>
				<Link href="/" className="text-blue-700 underline">
					Back to roster
				</Link>
			</main>
		);

	if (!patient)
		return (
			<main className="flex min-h-screen items-center justify-center text-slate-500">
				<Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading patient
				record…
			</main>
		);

	const checkup = CHECKUPS[patient.id];
	const currentMg = patient.schedule.doses.reduce((n, d) => n + d.mg, 0);
	const doseHistory =
		checkup && currentMg > 0
			? [...checkup.history, { label: "Today", mg: currentMg }]
			: null;

	return (
		<div className="flex min-h-screen bg-slate-50 text-slate-900">
			<AppSidebar />
			<main className="min-w-0 flex-1">
				<div className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
					<div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-6 py-3">
						<Link
							href="/"
							className="text-slate-400 hover:text-slate-700"
							aria-label="Back to roster"
						>
							<ArrowLeft className="h-5 w-5" />
						</Link>
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img
							src={`/patients/${patient.id}.svg`}
							alt=""
							width={44}
							height={44}
							className={`h-11 w-11 shrink-0 rounded-full bg-blue-50 ring-4 ring-offset-2 ${URGENCY_RING[patient.urgency]}`}
						/>
						<h1 className="flex items-baseline gap-2.5">
							<span className="text-xl font-bold tracking-tight">
								{patient.name}
							</span>
							{patient.age !== undefined && (
								<span className="text-sm text-slate-500">
									{patient.age} years old
								</span>
							)}
						</h1>
						<span
							className={`ml-auto inline-flex items-center gap-1.5 text-sm font-medium ${online ? "text-blue-700" : "text-slate-500"}`}
						>
							{online ? (
								<Radio className="h-4 w-4" aria-hidden />
							) : (
								<WifiOff className="h-4 w-4" aria-hidden />
							)}
							{online
								? "Vexo Bracelet Connected"
								: "Vexo Bracelet Disconnected"}
						</span>
					</div>
				</div>

				{error && error !== "Patient not found" && (
					<div
						role="alert"
						className="mx-auto mt-3 max-w-7xl px-6 text-sm text-red-700"
					>
						{error}
					</div>
				)}

				<div className="mx-auto max-w-7xl space-y-8 px-6 py-6">
					{checkup ? (
						<section
							className="overflow-hidden rounded-2xl border-2 border-blue-600 bg-white shadow-sm"
							aria-label="Last check-up recap"
						>
							<div className="flex flex-wrap items-center gap-3 bg-blue-600 px-6 py-4 text-white">
								<CalendarClock className="h-6 w-6" aria-hidden />
								<h2 className="text-2xl font-bold tracking-tight">
									Recap of the last check-up
								</h2>
								<span className="ml-auto rounded-full bg-white/20 px-3 py-1 text-sm font-semibold">
									{checkup.daysAgo} days ago
								</span>
							</div>
							<div className="grid gap-6 p-6 lg:grid-cols-[1.6fr_1fr]">
								<div className="min-w-0">
									<ul className="space-y-3">
										{checkup.bullets.map((b) => (
											<li
												key={b.title}
												className="flex gap-3 text-base text-slate-800"
											>
												<span className="w-40 shrink-0 font-semibold text-blue-700">
													{b.title}
												</span>
												<span>{renderBold(b.text)}</span>
											</li>
										))}
									</ul>
									<div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
										<p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-blue-700">
											<PenLine className="h-4 w-4" aria-hidden />
											Personal notes from last check-up
										</p>
										<p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-slate-800">
											{savedNotes ??
												checkup.doctorNotes ??
												"No notes recorded yet."}
										</p>
										{checkup.watchItems && (
											<div className="mt-3 border-t border-blue-100 pt-3">
												<p className="text-xs font-bold uppercase tracking-wide text-blue-700">
													To monitor until next check-up
												</p>
												<ul className="mt-1.5 space-y-1 text-sm text-slate-800">
													{checkup.watchItems.map((w) => (
														<li key={w} className="flex gap-2">
															<span className="text-blue-600">•</span>
															{w}
														</li>
													))}
												</ul>
											</div>
										)}
									</div>
								</div>
								<dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-slate-50 p-4 text-sm lg:border-l lg:border-slate-200">
									{checkup.profile.map((r) => (
										<div key={r.label}>
											<dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
												{r.label}
											</dt>
											<dd className="font-semibold text-slate-900">
												{r.value}
											</dd>
										</div>
									))}
								</dl>
							</div>
						</section>
					) : (
						<section className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
							No previous check-up on record.
						</section>
					)}

					{patient.id === "henri-m" && (
						<Link
							href="/modelization"
							className="group flex flex-wrap items-center gap-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 p-5 text-white shadow-md transition hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
						>
							<span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20">
								<Activity className="h-6 w-6" aria-hidden />
							</span>
							<span className="min-w-0 flex-1">
								<span className="block text-lg font-bold tracking-tight">
									Review this week's episodes
								</span>
								<span className="block text-sm text-blue-100">
									Replay the tremors, compare the voice over time, see when it
									happens
								</span>
							</span>
							<span className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-blue-700 transition-transform group-hover:translate-x-0.5">
								Open modelization <ArrowRight className="h-4 w-4" aria-hidden />
							</span>
						</Link>
					)}

					<div>
						<h2 className="mb-3 text-lg font-bold tracking-tight text-slate-900">
							Current medication level
						</h2>
						{currentMg > 0 ? (
							<div className="grid gap-4 lg:grid-cols-2">
								<MedCard
									name="Levodopa"
									unit="mg"
									doses={patient.schedule.doses}
									history={doseHistory}
								/>
								{checkup?.otherMeds.map((m) => (
									<MedCard
										key={m.name}
										name={m.name}
										unit={m.unit}
										doses={m.doses}
										history={[
											...m.history,
											{
												label: "Today",
												mg: m.doses.reduce((n, x) => n + x.mg, 0),
											},
										]}
									/>
								))}
							</div>
						) : (
							<p className="text-sm text-slate-500">No treatment recorded.</p>
						)}
					</div>

					<StreamPanels
						patient={patient}
						highlightCellId={highlight}
						flashCellIds={flash}
					/>

					<section className="rounded-xl border border-slate-200 bg-white p-5">
						<label
							htmlFor="assessment"
							className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900"
						>
							<PenLine className="h-5 w-5 text-blue-600" aria-hidden />
							Your notes
						</label>
						<div className="relative mt-3">
							<textarea
								id="assessment"
								value={assessment}
								onChange={(e) => setAssessment(e.target.value)}
								onBlur={saveNotes}
								rows={4}
								placeholder="Write or dictate your observations…"
								className="w-full resize-y rounded-lg border border-slate-200 py-3 pl-3 pr-16 text-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
							/>
							<button
								type="button"
								onClick={toggleMic}
								aria-pressed={listening}
								aria-label={listening ? "Stop dictation" : "Dictate your notes"}
								title={
									micOk
										? listening
											? "Stop dictation"
											: "Dictate"
										: "Dictation not supported in this browser"
								}
								disabled={!micOk}
								className={`absolute right-3 top-3 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${listening ? "animate-pulse bg-red-500 text-white" : "bg-blue-600 text-white hover:bg-blue-700"}`}
							>
								{listening ? (
									<Square className="h-4 w-4" aria-hidden />
								) : (
									<Mic className="h-5 w-5" aria-hidden />
								)}
							</button>
						</div>
						<div className="mt-4 flex flex-wrap items-center justify-end gap-3">
							<button
								onClick={synthesize}
								disabled={analyzing}
								className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors duration-150 hover:bg-blue-700 disabled:opacity-60"
							>
								{analyzing ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<Stethoscope className="h-4 w-4" aria-hidden />
								)}
								Run diagnosis &amp; proposals
							</button>
						</div>
					</section>

					<div ref={resultRef} className="scroll-mt-20 space-y-5">
						{analyzing && (
							<div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white p-12 text-sm text-slate-500">
								<Loader2 className="h-4 w-4 animate-spin" /> Correlating the
								data streams…
							</div>
						)}
						{analysis && (
							<>
								<EntanglementView patient={patient} analysis={analysis} />
								<div className="grid gap-4 md:grid-cols-2">
									<section className="rounded-xl border border-slate-200 bg-white p-5">
										<h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
											<PenLine className="h-4 w-4 text-blue-600" aria-hidden />{" "}
											Your assessment
										</h2>
										<p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
											{assessment.trim() || (
												<span className="text-slate-400">
													No assessment written.
												</span>
											)}
										</p>
									</section>
									<section className="rounded-xl border border-blue-200 bg-blue-50/50 p-5">
										<h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
											<Stethoscope
												className="h-4 w-4 text-blue-600"
												aria-hidden
											/>{" "}
											AI analysis
											<span className="ml-auto text-xs font-normal text-slate-500">
												confidence {Math.round(analysis.confidence * 100)}%
											</span>
										</h2>
										<p className="mt-2 text-sm text-slate-700">
											{analysis.summary}
										</p>
									</section>
								</div>
								<ClinicalReportView
									patient={patient}
									analysis={analysis}
									onVerify={verify}
									onApply={apply}
								/>
							</>
						)}
					</div>
				</div>
			</main>
		</div>
	);
}

export default function PatientPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = use(params);
	const entry = ROSTER.find((r) => r.id === id);
	const name = entry?.name ?? "patient";
	if (entry && !entry.live)
		return (
			<div className="flex min-h-screen bg-slate-50 text-slate-900">
				<AppSidebar />
				<main className="min-w-0 flex-1 px-6 py-8 md:px-10">
					<Link
						href="/"
						className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800"
					>
						<ArrowLeft className="h-4 w-4" aria-hidden /> Back to roster
					</Link>
					<div className="mx-auto mt-10 max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img
							src={`/patients/${entry.id}.svg`}
							alt=""
							width={72}
							height={72}
							className="mx-auto h-[72px] w-[72px] rounded-full bg-blue-50"
						/>
						<h1 className="mt-4 text-xl font-semibold">
							{entry.name}{" "}
							<span className="font-normal text-slate-500">· {entry.age}</span>
						</h1>
						<p className="text-sm text-slate-500">{entry.condition}</p>
						<p className="mt-5 rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600">
							Demo data not loaded for this patient. UX preview only.
						</p>
					</div>
				</main>
			</div>
		);
	return (
		<SecureGate patientName={name}>
			<PatientCockpit params={params} />
		</SecureGate>
	);
}
