"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { ROSTER, type RosterEntry } from "@/data/rosterCatalog";
import type { PatientSummary } from "@/types/clinical";

function Card({ p, stage }: { p: RosterEntry; stage?: number }) {
	const body = (
		<>
			{/* eslint-disable-next-line @next/next/no-img-element */}
			<img
				src={`/patients/${p.id}.svg`}
				alt={`Portrait of ${p.name}`}
				width={96}
				height={96}
				className="h-24 w-24 rounded-full bg-blue-50 ring-4 ring-white"
			/>
			<h2 className="mt-4 text-base font-semibold text-slate-900">{p.name}</h2>
			{p.age !== undefined && (
				<p className="text-sm text-slate-500">{p.age} years old</p>
			)}
			<span className="mt-3 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
				{p.condition}
			</span>
			<p className="mt-2 text-xs tabular-nums text-slate-500">
				{stage ? `Stage ${stage}` : "Stage not recorded"}
			</p>
			{!p.live && (
				<p className="mt-1 text-xs text-slate-400">UX preview only</p>
			)}
		</>
	);
	const base =
		"flex h-full flex-col items-center rounded-xl border border-slate-200 bg-white p-6 text-center transition duration-150";
	return (
		<Link
			href={`/patient/${p.id}`}
			className={`${base} cursor-pointer hover:border-blue-500 hover:shadow-lg hover:shadow-slate-900/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600`}
		>
			{body}
		</Link>
	);
}

export default function RosterPage() {
	const [stages, setStages] = useState<Record<string, number>>({});
	const [query, setQuery] = useState("");
	useEffect(() => {
		fetch("/api/patients", { cache: "no-store" })
			.then((r) => (r.ok ? (r.json() as Promise<PatientSummary[]>) : []))
			.then((list) =>
				setStages(
					Object.fromEntries(
						list.filter((x) => x.stage).map((x) => [x.id, x.stage as number]),
					),
				),
			)
			.catch(() => {});
	}, []);
	const shown = ROSTER.filter((p) =>
		p.name.toLowerCase().includes(query.trim().toLowerCase()),
	);
	return (
		<div className="flex min-h-screen bg-slate-50 text-slate-900">
			<AppSidebar />
			<main className="min-w-0 flex-1 px-6 py-8 md:px-10">
				<header className="mb-8 flex flex-wrap items-center justify-between gap-4">
					<div>
						<h1 className="text-2xl font-semibold tracking-tight">
							My patients
						</h1>
						<p className="mt-1 text-sm text-slate-500">
							{ROSTER.length} patients
						</p>
					</div>
					<label className="relative block w-full sm:w-72">
						<span className="sr-only">Search patients</span>
						<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
						<input
							type="search"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder="Search a patient"
							className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
						/>
					</label>
				</header>

				<ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
					{shown.map((p) => (
						<li key={p.id}>
							<Card p={p} stage={stages[p.id]} />
						</li>
					))}
				</ul>
			</main>
		</div>
	);
}
