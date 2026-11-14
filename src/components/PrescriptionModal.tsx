"use client";
// T4 · Updated digital prescription + live Vexo actuation confirmation + armed intake verification.
import {
	CheckCircle2,
	CircleDashed,
	FileText,
	Radio,
	Volume2,
	X,
} from "lucide-react";
import { useEffect, useRef } from "react";
import type { ActuationResult, AdherenceSignal } from "@/types/clinical";

const SIGNAL_LABEL: Record<AdherenceSignal, string> = {
	led_haptic_cue: "Cue delivered (amber LED, double blink)",
	hand_to_mouth: "Hand-to-mouth gesture within 5 min",
	water_sound: "Water sound detected (Pill_Water)",
	post_dose_tremor_drop: "Tremor drop at +35 min",
};

export default function PrescriptionModal({
	result,
	onClose,
}: {
	result: ActuationResult;
	onClose: () => void;
}) {
	const { prescription: rx, command, vexo, voice } = result;
	const closeRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		closeRef.current?.focus();
		const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
		window.addEventListener("keydown", h);
		const prev = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => {
			window.removeEventListener("keydown", h);
			document.body.style.overflow = prev;
		};
	}, [onClose]);

	const changed = (time: string) =>
		rx.changes.some((c) => c.includes(`→ ${time}`));
	const badge = (ok: boolean, simulated: boolean) =>
		ok
			? simulated
				? "border-amber-200 bg-amber-50 text-amber-800"
				: "border-emerald-200 bg-emerald-50 text-emerald-700"
			: "border-red-200 bg-red-50 text-red-700";

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center p-4"
			role="presentation"
		>
			<button
				type="button"
				aria-label="Close"
				className="absolute inset-0 bg-slate-900/40"
				onClick={onClose}
				tabIndex={-1}
			/>
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="rx-title"
				className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
			>
				<div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
					<div>
						<p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700">
							<CheckCircle2 className="size-4" /> Protocol applied
						</p>
						<h2
							id="rx-title"
							className="mt-0.5 text-xl font-semibold text-slate-900"
						>
							Updated prescription · v{rx.version}
						</h2>
					</div>
					<button
						ref={closeRef}
						type="button"
						onClick={onClose}
						aria-label="Close prescription"
						className="inline-flex size-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors duration-150 hover:bg-slate-50"
					>
						<X className="size-4" />
					</button>
				</div>

				<div className="grid flex-1 gap-5 overflow-y-auto p-5 md:grid-cols-2">
					{/* Digital prescription */}
					<section
						className="rounded-xl border border-slate-200 bg-slate-50 p-5"
						aria-label="Digital prescription"
					>
						<p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
							<FileText className="size-3.5" /> Digital prescription
						</p>
						<dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
							<dt className="text-slate-500">Patient</dt>
							<dd className="font-medium text-slate-900">{rx.patientName}</dd>
							<dt className="text-slate-500">Prescriber</dt>
							<dd className="text-slate-900">{rx.prescriber}</dd>
							<dt className="text-slate-500">Issued</dt>
							<dd className="tabular-nums text-slate-900">
								{new Date(rx.issuedAt).toLocaleString("en-GB", {
									dateStyle: "medium",
									timeStyle: "short",
								})}
							</dd>
							<dt className="text-slate-500">Reference</dt>
							<dd className="truncate tabular-nums text-slate-900">{rx.id}</dd>
						</dl>
						<table className="mt-4 w-full text-sm">
							<thead>
								<tr className="text-left text-xs uppercase tracking-wide text-slate-500">
									<th className="pb-1 font-semibold">Medication</th>
									<th className="pb-1 font-semibold">Dose</th>
									<th className="pb-1 text-right font-semibold">Time</th>
								</tr>
							</thead>
							<tbody>
								{rx.doses.map((d) => (
									<tr key={d.id} className="border-t border-slate-200">
										<td className="py-1.5 text-slate-900">{d.label}</td>
										<td className="py-1.5 tabular-nums text-slate-600">
											{d.mg} mg
										</td>
										<td className="py-1.5 text-right">
											<span
												className={`rounded-full px-2 py-0.5 font-medium tabular-nums ${changed(d.time) ? "border border-blue-600/30 bg-blue-50 text-blue-800" : "text-slate-900"}`}
											>
												{d.time}
											</span>
										</td>
									</tr>
								))}
								{rx.nudges.map((n) => (
									<tr key={n.id} className="border-t border-slate-200">
										<td className="py-1.5 text-slate-900">{n.label}</td>
										<td className="py-1.5 text-slate-600">Cue</td>
										<td className="py-1.5 text-right">
											<span className="rounded-full border border-blue-600/30 bg-blue-50 px-2 py-0.5 font-medium tabular-nums text-blue-800">
												{n.time}
											</span>
										</td>
									</tr>
								))}
							</tbody>
						</table>
						<p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
							Changes
						</p>
						<ul className="mt-1 space-y-1 text-sm text-slate-700">
							{rx.changes.map((c) => (
								<li key={c} className="flex gap-2">
									<span className="mt-2 size-1 shrink-0 rounded-full bg-blue-600" />
									{c}
								</li>
							))}
						</ul>
					</section>

					{/* Actuation */}
					<section className="space-y-4" aria-label="Vexo wristband actuation">
						<div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
							<p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
								<Radio className="size-3.5" /> Vexo wristband
							</p>
							<style>{`
                @keyframes np-blink{0%,100%{opacity:.15}12%,32%{opacity:1}22%{opacity:.15}}
                @media (prefers-reduced-motion: reduce){.np-blink{animation:none!important;opacity:1!important}}
              `}</style>
							<div className="mt-3 flex items-center gap-4">
								<div
									className="flex h-12 w-24 items-center justify-between rounded-xl bg-blue-600 px-3"
									aria-hidden="true"
								>
									<div className="h-3 w-8 rounded bg-slate-900/80" />
									<span
										className="np-blink size-3.5 rounded-full bg-amber-400 shadow-[0_0_10px_2px_#fbbf24]"
										style={{ animation: "np-blink 1.6s ease-in-out infinite" }}
									/>
								</div>
								<div className="min-w-0 text-sm">
									<p className="font-medium text-slate-900">
										Amber LED · double cue
									</p>
									<p className="text-slate-600">
										Sent for the {command.arm.dueAt} dose
									</p>
								</div>
							</div>
							<div className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
								<span
									className={`rounded-full border px-2 py-0.5 ${badge(vexo.delivered, vexo.simulated)}`}
								>
									{vexo.delivered
										? vexo.simulated
											? "Wristband · simulated"
											: "Wristband · delivered"
										: "Wristband · not delivered"}
								</span>
								<span
									className={`rounded-full border px-2 py-0.5 ${badge(voice.generated, voice.simulated)}`}
								>
									{voice.generated
										? voice.simulated
											? "Voice · simulated"
											: "Voice · generated"
										: "Voice · not generated"}
								</span>
							</div>
							<p className="mt-2 text-xs text-slate-500">{vexo.detail}</p>
							<p className="mt-3 flex gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
								<Volume2 className="mt-0.5 size-4 shrink-0 text-slate-500" />
								<span>“{command.voiceText}”</span>
							</p>
						</div>

						<div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
							<div className="flex items-center justify-between gap-3">
								<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
									Closed-loop intake verification
								</p>
								<span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
									Armed · due {command.arm.dueAt}
								</span>
							</div>
							<ul className="mt-3 space-y-2">
								{command.arm.signals.map((s, i) => {
									const done = command.arm.confirmed[i];
									return (
										<li key={s} className="flex items-center gap-2 text-sm">
											{done ? (
												<CheckCircle2 className="size-4 text-emerald-600" />
											) : (
												<CircleDashed className="size-4 text-slate-400" />
											)}
											<span
												className={done ? "text-slate-900" : "text-slate-600"}
											>
												{SIGNAL_LABEL[s]}
											</span>
											<span
												className={`ml-auto text-xs ${done ? "text-emerald-700" : "text-slate-400"}`}
											>
												{done ? "Confirmed" : "Waiting"}
											</span>
										</li>
									);
								})}
							</ul>
							<p className="mt-3 text-xs text-slate-500">
								No patient tap needed. Intake is confirmed automatically from
								the wrist.
							</p>
						</div>
					</section>
				</div>

				<div className="flex justify-end border-t border-slate-200 px-5 py-3">
					<button
						type="button"
						onClick={onClose}
						className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:bg-blue-700"
					>
						Done
					</button>
				</div>
			</div>
		</div>
	);
}
