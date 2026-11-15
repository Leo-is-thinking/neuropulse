"use client";

import { ArrowLeft, Radio } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import DayPicker, { type PickerRow } from "@/components/DayPicker";
import LiveTremorEpisodes from "@/components/LiveTremorEpisodes";
import LiveVoiceEpisodes from "@/components/LiveVoiceEpisodes";
import TremorReplay from "@/components/TremorReplay";
import VoiceCompare from "@/components/VoiceCompare";
import { episodeFor, voiceForDay } from "@/data/modelization";
import type { Cell, Patient, Weekday } from "@/types/clinical";

function byDay(cells: Cell[], metric: string) {
	const out: Partial<Record<Weekday, Cell>> = {};
	for (const c of cells)
		if (c.metric === metric && c.day !== "Live") out[c.day as Weekday] = c;
	return out;
}

export default function ModelizationPage() {
	return (
		<Suspense fallback={null}>
			<Modelization />
		</Suspense>
	);
}

function Modelization() {
	const param = useSearchParams().get("patient");
	const [saved, setSaved] = useState<string | null>(null);
	useEffect(() => {
		if (param) sessionStorage.setItem("np-patient", param);
		setSaved(sessionStorage.getItem("np-patient"));
	}, [param]);
	const PATIENT = (param ?? saved) === "armel" ? "armel" : "henri-m";
	const [who, setWho] = useState<{ name: string; age?: number } | null>(null);
	const [cells, setCells] = useState<Cell[]>([]);
	const [tDay, setTDay] = useState<Weekday>("Tue");
	const [vDay, setVDay] = useState<Weekday>("Tue");
	const [cmp, setCmp] = useState(false);
	const [cDay, setCDay] = useState<Weekday>("Mon");

	useEffect(() => {
		fetch(`/api/patients/${PATIENT}`, { cache: "no-store" })
			.then((r) => (r.ok ? (r.json() as Promise<Patient>) : null))
			.then((p) => {
				if (!p) return;
				setCells(p.cells);
				setWho({ name: p.name, age: p.age });
			})
			.catch(() => {});
	}, [PATIENT]);

	const burden = useMemo(() => byDay(cells, "tremor_burden"), [cells]);
	const intensity = useMemo(() => byDay(cells, "tremor_intensity"), [cells]);
	const speech = useMemo(() => byDay(cells, "speech_rate"), [cells]);

	const tremorRows: PickerRow[] = [
		{ label: "Tremor time", unit: "% of day", cells: burden },
		{ label: "Tremor intensity", unit: "/10", cells: intensity },
	];
	const speechRows: PickerRow[] = [
		{ label: "Speech rate", unit: "words/min", cells: speech },
	];

	const ready = cells.length > 0;
	const h = episodeFor(
		tDay,
		Number(intensity[tDay]?.value ?? 0) || 0,
		Number(burden[tDay]?.value ?? 0) || 0,
	);
	const h2 = episodeFor(
		cDay,
		Number(intensity[cDay]?.value ?? 0) || 0,
		Number(burden[cDay]?.value ?? 0) || 0,
	);
	const voice = voiceForDay(vDay, Number(speech[vDay]?.value ?? 0) || 13);

	return (
		<div className="flex min-h-screen bg-slate-50 text-slate-900">
			<AppSidebar />
			<main className="min-w-0 flex-1">
				<div className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
					<div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-6 py-3">
						<Link
							href={`/patient/${PATIENT}`}
							className="text-slate-400 hover:text-slate-700"
							aria-label="Back to patient"
						>
							<ArrowLeft className="h-5 w-5" />
						</Link>
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img
							src={`/patients/${PATIENT}.svg`}
							alt=""
							width={44}
							height={44}
							className="h-11 w-11 rounded-full bg-blue-50"
						/>
						<h1 className="flex items-baseline gap-2.5">
							<span className="text-xl font-bold tracking-tight">
								Modelization
							</span>
							<span className="text-sm text-slate-500">
								{PATIENT === "armel"
									? "Armel"
									: who
										? `${who.name}${who.age ? `, ${who.age} years old` : ""}`
										: "Henri M., 74 years old"}
							</span>
						</h1>
						<span className="ml-auto inline-flex items-center gap-1.5 text-sm font-medium text-blue-700">
							<Radio className="h-4 w-4" aria-hidden /> Rebuilt from Vexo
							Bracelet data
						</span>
					</div>
				</div>

				<div className="mx-auto max-w-7xl space-y-8 px-6 py-6">
					<p className="max-w-3xl text-slate-600">
						Episodes can be replayed from the band's own motion and voice data,
						not only counted.
					</p>

					{PATIENT === "armel" ? (
						<>
							<section
								className="rounded-2xl border border-slate-200 bg-white p-6"
								aria-labelledby="m-tremor"
							>
								<h2 id="m-tremor" className="text-xl font-bold tracking-tight">
									1. Tremor episodes (live)
								</h2>
								<p className="mb-3 mt-1 text-sm text-slate-600">
									The newest episode recorded by the band opens by itself, with
									her posture and a written synthesis.
								</p>
								<LiveTremorEpisodes patientId="armel" follow />
							</section>
							<section
								className="rounded-2xl border border-slate-200 bg-white p-6"
								aria-labelledby="m-voice"
							>
								<h2 id="m-voice" className="text-xl font-bold tracking-tight">
									2. Voice (live)
								</h2>
								<p className="mb-3 mt-1 text-sm text-slate-600">
									Phrases spoken near the band: rate, volume, transcript and
									audio.
								</p>
								<LiveVoiceEpisodes patientId="armel" comments />
							</section>
						</>
					) : (
						<>
							<section
								className="rounded-2xl border border-slate-200 bg-white p-6"
								aria-labelledby="m-tremor"
							>
								<h2 id="m-tremor" className="text-xl font-bold tracking-tight">
									1. Tremor episodes
								</h2>
								<p className="mt-1 text-sm text-slate-600">
									Pick any day to replay its episode. Red cells are the
									strongest tremor, but you choose.
								</p>
								<div className="mt-3">
									<DayPicker
										rows={tremorRows}
										selected={tDay}
										onSelect={setTDay}
										caption="Tremor by day"
									/>
								</div>
								<div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
									<label className="inline-flex cursor-pointer items-center gap-2 font-medium text-slate-700">
										<input
											type="checkbox"
											checked={cmp}
											onChange={(e) => setCmp(e.target.checked)}
											className="h-4 w-4 accent-blue-600"
										/>
										Compare with another day
									</label>
									{cmp && (
										<select
											value={cDay}
											onChange={(e) => setCDay(e.target.value as Weekday)}
											aria-label="Day to compare"
											className="rounded-lg border border-slate-300 bg-white px-2 py-1"
										>
											{(
												[
													"Mon",
													"Tue",
													"Wed",
													"Thu",
													"Fri",
													"Sat",
													"Sun",
												] as Weekday[]
											).map((d) => (
												<option key={d} value={d}>
													{d}
												</option>
											))}
										</select>
									)}
								</div>
								<div
									className={`mt-5 grid gap-5 ${cmp ? "2xl:grid-cols-2" : ""}`}
								>
									{ready && <TremorReplay key={h.id} h={h} />}
									{ready && cmp && <TremorReplay key={`c-${h2.id}`} h={h2} />}
								</div>
							</section>

							<section
								className="rounded-2xl border border-slate-200 bg-white p-6"
								aria-labelledby="m-voice"
							>
								<h2 id="m-voice" className="text-xl font-bold tracking-tight">
									2. Voice
								</h2>
								<p className="mt-1 text-sm text-slate-600">
									Everyday recordings from the band, compared over time.
								</p>
								<div className="mt-3">
									<DayPicker
										rows={speechRows}
										selected={vDay}
										onSelect={setVDay}
										caption="Speech rate by day"
									/>
								</div>
								<p className="mt-2 text-xs text-slate-500">
									Typical adult conversation: about 130 words/min. Pick a day to
									hear it against the past.
								</p>
								<div className="mt-4">
									<VoiceCompare key={vDay} recent={voice} />
								</div>
							</section>
						</>
					)}
				</div>
			</main>
		</div>
	);
}
