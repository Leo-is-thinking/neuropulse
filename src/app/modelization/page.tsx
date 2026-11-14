"use client";

import { ArrowLeft, Radio } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import DayPicker, { type PickerRow } from "@/components/DayPicker";
import LiveTremorEpisodes from "@/components/LiveTremorEpisodes";
import MyBand from "@/components/MyBand";
import MyVoice from "@/components/MyVoice";
import TimeOfDayChart from "@/components/TimeOfDayChart";
import TremorReplay from "@/components/TremorReplay";
import VoiceCompare from "@/components/VoiceCompare";
import {
	DIAGNOSIS,
	DOSE_LOG,
	episodeFor,
	PATTERN_NOTES,
	voiceForDay,
} from "@/data/modelization";
import { renderBold } from "@/lib/renderBold";
import type { Cell, Patient, Weekday } from "@/types/clinical";

const PATIENT = "henri-m";

function byDay(cells: Cell[], metric: string) {
	const out: Partial<Record<Weekday, Cell>> = {};
	for (const c of cells)
		if (c.metric === metric && c.day !== "Live") out[c.day as Weekday] = c;
	return out;
}

export default function ModelizationPage() {
	const [cells, setCells] = useState<Cell[]>([]);
	const [tDay, setTDay] = useState<Weekday>("Tue");
	const [vDay, setVDay] = useState<Weekday>("Tue");
	const [cmp, setCmp] = useState(false);
	const [cDay, setCDay] = useState<Weekday>("Mon");

	useEffect(() => {
		fetch(`/api/patients/${PATIENT}`, { cache: "no-store" })
			.then((r) => (r.ok ? (r.json() as Promise<Patient>) : null))
			.then((p) => p && setCells(p.cells))
			.catch(() => {});
	}, []);

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
							href="/patient/henri-m"
							className="text-slate-400 hover:text-slate-700"
							aria-label="Back to patient"
						>
							<ArrowLeft className="h-5 w-5" />
						</Link>
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img
							src="/patients/henri-m.svg"
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
								Henri M., 74 years old
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

					<section
						aria-labelledby="m-live"
						className="mt-10 scroll-mt-24"
					>
						<h2 id="m-live" className="text-xl font-bold tracking-tight">
							Live tremor episodes — Armel
						</h2>
						<p className="mt-1 text-sm text-slate-600">
							Recorded from the band as they happen. Each episode keeps its frequency, strength and wrist orientation.
						</p>
						<div className="mt-4">
							<LiveTremorEpisodes patientId="armel" />
						</div>
					</section>

					<section
						className="rounded-2xl border border-slate-200 bg-white p-6"
						aria-labelledby="m-tremor"
					>
						<h2 id="m-tremor" className="text-xl font-bold tracking-tight">
							1. Tremor episodes
						</h2>
						<p className="mt-1 text-sm text-slate-600">
							Pick any day to replay its episode. Red cells are the strongest
							tremor, but you choose.
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
						<div className={`mt-5 grid gap-5 ${cmp ? "2xl:grid-cols-2" : ""}`}>
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

					<section
						className="rounded-2xl border border-slate-200 bg-white p-6"
						aria-labelledby="m-patterns"
					>
						<h2 id="m-patterns" className="text-xl font-bold tracking-tight">
							3. Time of day
						</h2>
						<p className="mt-1 text-sm text-slate-600">
							Tremor and speech crossed with dose times, last 4 weeks.
						</p>
						<div className="mt-4">
							<TimeOfDayChart />
						</div>
						<ul className="mt-5 space-y-1.5 border-t border-slate-100 pt-4 text-sm text-slate-700">
							{PATTERN_NOTES.map((n) => (
								<li key={n} className="flex gap-2">
									<span
										className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600"
										aria-hidden
									/>
									<span>{renderBold(n)}</span>
								</li>
							))}
						</ul>
					</section>

					<section
						className="rounded-2xl border border-blue-200 bg-blue-50/50 p-6"
						aria-labelledby="m-diag"
					>
						<h2 id="m-diag" className="text-xl font-bold tracking-tight">
							4. What crossing the data shows
						</h2>
						<p className="mt-1 text-sm text-slate-600">{DIAGNOSIS.title}</p>
						<ol className="mt-4 grid gap-3 md:grid-cols-2">
							{DIAGNOSIS.steps.map((st) => (
								<li
									key={st.stream}
									className="rounded-xl border border-slate-200 bg-white p-4"
								>
									<p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
										{st.stream}
									</p>
									<p className="mt-1 text-sm text-slate-700">
										{renderBold(st.text)}
									</p>
								</li>
							))}
						</ol>
						<div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
							<table className="w-full text-left text-sm">
								<caption className="p-3 text-left text-xs font-semibold text-slate-500">
									Prescribed vs taken (pill box and water sound)
								</caption>
								<thead className="text-xs text-slate-500">
									<tr>
										<th className="px-3 py-1.5">Dose</th>
										<th className="px-3 py-1.5">Prescribed</th>
										<th className="px-3 py-1.5">Taken</th>
									</tr>
								</thead>
								<tbody>
									{DOSE_LOG.map((d) => (
										<tr key={d.label} className="border-t border-slate-100">
											<td className="px-3 py-1.5">{d.label}</td>
											<td className="px-3 py-1.5 tabular-nums">
												{d.prescribed}
											</td>
											<td className="px-3 py-1.5 font-semibold tabular-nums text-red-700">
												{d.taken}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
						<p className="mt-4 text-sm font-medium text-slate-800">
							{renderBold(DIAGNOSIS.conclusion)}
						</p>
						<ul className="mt-3 space-y-1.5 text-sm text-slate-700">
							{DIAGNOSIS.actions.map((a) => (
								<li key={a} className="flex gap-2">
									<span
										className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600"
										aria-hidden
									/>
									<span>{renderBold(a)}</span>
								</li>
							))}
						</ul>
						<p className="mt-3 text-xs text-slate-500">
							Decision support from simulated data. The clinician decides.
						</p>
					</section>

					<section
						className="rounded-2xl border border-slate-200 bg-white p-6"
						aria-labelledby="m-band"
					>
						<h2 id="m-band" className="text-xl font-bold tracking-tight">
							5. My band, live
						</h2>
						<p className="mt-1 text-sm text-slate-600">
							Your real movements drive the arm. Switch between tremor sets to
							compare intensity and context.
						</p>
						<div className="mt-4">
							<MyBand />
						</div>
					</section>

					<section
						className="rounded-2xl border border-slate-200 bg-white p-6"
						aria-labelledby="m-myvoice"
					>
						<h2 id="m-myvoice" className="text-xl font-bold tracking-tight">
							6. My voice
						</h2>
						<p className="mt-1 text-sm text-slate-600">
							Real recordings, transcribed by Deepgram. Record a normal voice,
							then a weaker one.
						</p>
						<div className="mt-4">
							<MyVoice />
						</div>
					</section>

					<p className="text-xs text-slate-400">
						Demo dataset for Henri M., simulated to match the check-up record.
					</p>
				</div>
			</main>
		</div>
	);
}
