"use client";
// T4 · Plain-English clinical report + 1-click protocol actions.
import {
	ArrowRight,
	Footprints,
	Loader2,
	Pill,
	ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import type {
	ActuationResult,
	Analysis,
	Patient,
	Recommendation,
} from "@/types/clinical";
import PrescriptionModal from "./PrescriptionModal";

interface Props {
	patient: Patient;
	analysis: Analysis;
	/** T3 scrolls/highlights the raw-data cell with this id. */
	onVerify: (cellId: string) => void;
	/** POST /api/actuate-wrist (wired by T3). */
	onApply: (recIds: string[]) => Promise<ActuationResult>;
}

function actionPreview(r: Recommendation) {
	const a = r.action;
	return a.type === "shift_dose"
		? {
				icon: <Pill className="size-4" />,
				from: a.from,
				to: a.to,
				tag: "Levodopa",
			}
		: {
				icon: <Footprints className="size-4" />,
				from: "—",
				to: a.time,
				tag: "Outdoor walk cue",
			};
}

export default function ClinicalReportView({
	patient,
	analysis,
	onVerify,
	onApply,
}: Props) {
	const [selected, setSelected] = useState<Set<string>>(
		() => new Set(analysis.recommendations.map((r) => r.id)),
	);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [result, setResult] = useState<ActuationResult | null>(null);
	const [showRx, setShowRx] = useState(false);

	const label = (cellId: string) => {
		const c = patient.cells.find((x) => x.id === cellId);
		return c ? `${c.day} · ${c.label}` : cellId;
	};
	const toggle = (id: string) =>
		setSelected((s) => {
			const n = new Set(s);
			if (!n.delete(id)) n.add(id);
			return n;
		});

	const apply = async () => {
		setBusy(true);
		setError(null);
		try {
			setResult(await onApply([...selected]));
			setShowRx(true);
		} catch {
			setError("Could not sync the Vexo band. Please retry.");
		} finally {
			setBusy(false);
		}
	};

	const applied = result !== null;

	return (
		<div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
			<section
				className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
				aria-label="Clinical findings"
			>
				<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
					Clinical report · {patient.name}, {patient.age}
				</p>
				<p className="mt-2 text-base font-medium text-slate-900">
					{analysis.summary}
				</p>
				<ol className="mt-4 space-y-4">
					{analysis.findings.map((f, i) => (
						<li key={i} className="flex gap-3">
							<span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold tabular-nums text-blue-800">
								{i + 1}
							</span>
							<div className="min-w-0 text-sm text-slate-700">
								<p>{f.text}</p>
								<div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
									{f.cellRefs.slice(0, 3).map((ref, j) => (
										<button
											key={ref}
											type="button"
											onClick={() => onVerify(ref)}
											title={label(ref)}
											className="text-xs font-medium text-blue-700 underline-offset-2 transition-colors duration-150 hover:text-blue-800 hover:underline"
										>
											{j === 0 ? "[Verify in Raw Data]" : `[${label(ref)}]`}
										</button>
									))}
									{f.reliability !== undefined && (
										<span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium tabular-nums text-slate-600">
											{Math.round(f.reliability * 100)}% reliable
										</span>
									)}
								</div>
							</div>
						</li>
					))}
				</ol>
			</section>

			<section
				className="h-fit rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-4"
				aria-label="Recommended protocol"
			>
				<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
					Recommended protocol
				</p>
				<ul className="mt-3 space-y-3">
					{analysis.recommendations.map((r) => {
						const p = actionPreview(r);
						const on = selected.has(r.id);
						return (
							<li key={r.id}>
								<label
									className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors duration-150 ${
										on
											? "border-blue-600/40 bg-blue-50"
											: "border-slate-200 bg-white hover:bg-slate-50"
									} ${applied ? "pointer-events-none opacity-70" : ""}`}
								>
									<input
										type="checkbox"
										checked={on}
										disabled={applied || busy}
										onChange={() => toggle(r.id)}
										className="mt-1 size-4 accent-blue-600"
									/>
									<span className="min-w-0 text-sm">
										<span className="flex items-center gap-1.5 font-semibold text-slate-900">
											{p.icon}
											{r.title}
										</span>
										<span className="mt-1 block text-slate-600">
											{r.rationale}
										</span>
										<span className="mt-2 inline-flex items-center gap-2 rounded-lg bg-white px-2 py-1 text-xs font-medium tabular-nums text-slate-700 ring-1 ring-slate-200">
											{p.tag}
											{p.from !== "—" && (
												<span className="text-slate-400 line-through">
													{p.from}
												</span>
											)}
											{p.from !== "—" && (
												<ArrowRight className="size-3 text-slate-400" />
											)}
											<span className="text-blue-800">{p.to}</span>
										</span>
									</span>
								</label>
							</li>
						);
					})}
				</ul>

				{error && (
					<p role="alert" className="mt-3 text-sm text-red-700">
						{error}
					</p>
				)}

				{applied ? (
					<div className="mt-4 space-y-2">
						<p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-700">
							<ShieldCheck className="size-4" /> Protocol applied · prescription
							v{result.prescription.version} · intake verification armed
						</p>
						<button
							type="button"
							onClick={() => setShowRx(true)}
							className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-50"
						>
							View prescription
						</button>
					</div>
				) : (
					<button
						type="button"
						onClick={apply}
						disabled={busy || selected.size === 0}
						className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
					>
						{busy && <Loader2 className="size-4 animate-spin" />}
						{busy ? "Syncing Vexo band…" : "Apply Protocol & Sync Vexo Band"}
					</button>
				)}
				<p className="mt-2 text-xs text-slate-500">
					Sends an amber LED cue and a voice reminder to the band, then arms
					automatic intake verification.
				</p>
			</section>

			{result && showRx && (
				<PrescriptionModal result={result} onClose={() => setShowRx(false)} />
			)}
		</div>
	);
}
