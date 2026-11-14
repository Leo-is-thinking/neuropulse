"use client";

import {
	Activity,
	AudioLines,
	Footprints,
	HeartPulse,
	type LucideIcon,
	Mic,
	Moon,
	Pill,
	Scale,
} from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import {
	type Cell,
	type DayColumn,
	type Flag,
	type Patient,
	type StreamId,
	WEEKDAYS,
} from "@/types/clinical";

/** Window event other views dispatch to jump to a raw-data cell. detail: { cellId: string } */
export const VERIFY_CELL_EVENT = "neuropulse:verify-cell";

export function verifyInRawData(cellId: string) {
	window.dispatchEvent(
		new CustomEvent(VERIFY_CELL_EVENT, { detail: { cellId } }),
	);
}

const COLUMNS: DayColumn[] = [...WEEKDAYS, "Live"];

const STREAMS: { id: StreamId; title: string; icon: LucideIcon }[] = [
	{ id: "voice", title: "Voice · Hypophonia & Engagement", icon: Mic },
	{ id: "tremor", title: "Tremor & Dyskinesia · IMU", icon: Activity },
	{ id: "balance", title: "Balance & Falls · IMU", icon: Scale },
	{ id: "sleep", title: "Sleep & Nocturia", icon: Moon },
	{ id: "mobility", title: "Mobility & Outdoor Time", icon: Footprints },
	{ id: "acoustic", title: "Acoustic Environment", icon: AudioLines },
	{ id: "cardiac", title: "Cardiac Biometrics · PPG", icon: HeartPulse },
	{ id: "adherence", title: "Therapeutic Adherence", icon: Pill },
];

const FLAG_STYLE: Record<Flag, string> = {
	ok: "text-slate-700",
	warn: "bg-amber-50 text-amber-800 font-medium",
	alert: "bg-red-50 text-red-700 font-semibold",
};

const FLAG_DOT: Record<Flag, string> = {
	ok: "",
	warn: "bg-amber-500",
	alert: "bg-red-500",
};

function fmt(v: Cell["value"]): string {
	return typeof v === "number" ? v.toLocaleString("en-US") : v;
}

interface Props {
	patient: Patient;
	/** Cell id to scroll to and highlight (from [Verify in Raw Data]). */
	highlightCellId?: string | null;
	/** Cell ids that just changed through live ingestion (brief flash). */
	flashCellIds?: Set<string>;
}

export default function RawDataTables({
	patient,
	highlightCellId,
	flashCellIds,
}: Props) {
	const rootRef = useRef<HTMLDivElement>(null);

	// metric rows grouped by stream, keeping seed order
	const grouped = useMemo(() => {
		const byStream = new Map<StreamId, Map<string, Map<DayColumn, Cell>>>();
		for (const c of patient.cells) {
			if (!byStream.has(c.stream)) byStream.set(c.stream, new Map());
			const metrics = byStream.get(c.stream)!;
			if (!metrics.has(c.metric)) metrics.set(c.metric, new Map());
			metrics.get(c.metric)!.set(c.day, c);
		}
		return byStream;
	}, [patient.cells]);

	useEffect(() => {
		if (!highlightCellId) return;
		const el = rootRef.current?.querySelector<HTMLElement>(
			`[data-cell-id="${CSS.escape(highlightCellId)}"]`,
		);
		el?.scrollIntoView({
			behavior: "smooth",
			block: "center",
			inline: "center",
		});
	}, [highlightCellId]);

	return (
		<div ref={rootRef} className="space-y-4">
			{STREAMS.map(({ id, title, icon: Icon }) => {
				const metrics = grouped.get(id);
				if (!metrics) return null;
				return (
					<section
						key={id}
						className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
					>
						<header className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
							<Icon className="h-4 w-4 text-blue-700" aria-hidden />
							<h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
								{title}
							</h3>
						</header>
						<div className="overflow-x-auto">
							<table className="w-full min-w-[760px] border-collapse text-[13px] tabular-nums">
								<thead>
									<tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
										<th className="sticky left-0 z-10 w-56 bg-white px-3 py-1.5 font-medium">
											Metric
										</th>
										{COLUMNS.map((d) => (
											<th
												key={d}
												className={`px-2 py-1.5 text-right font-medium ${
													d === "Live" ? "bg-blue-50 text-blue-800" : ""
												}`}
											>
												{d === "Live" ? (
													<span className="inline-flex items-center gap-1">
														<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-600" />
														LIVE
													</span>
												) : (
													d
												)}
											</th>
										))}
									</tr>
								</thead>
								<tbody>
									{[...metrics.entries()].map(([metric, days]) => {
										const first = days.values().next().value as Cell;
										return (
											<tr key={metric} className="border-t border-slate-100">
												<th
													scope="row"
													className="sticky left-0 z-10 bg-white px-3 py-1 text-left font-normal text-slate-800"
												>
													<div className="leading-tight">{first.label}</div>
													<div className="text-[11px] text-slate-400">
														{first.unit}
														{first.baseline !== undefined &&
															` · baseline ${fmt(first.baseline)}`}
													</div>
												</th>
												{COLUMNS.map((d) => {
													const c = days.get(d);
													if (!c) return <td key={d} />;
													const highlighted = highlightCellId === c.id;
													const flashing = flashCellIds?.has(c.id);
													return (
														<td
															key={d}
															id={c.id}
															data-cell-id={c.id}
															title={c.note}
															className={`relative px-2 py-1 text-right transition-colors duration-500 ${
																d === "Live" && c.flag === "ok"
																	? "bg-blue-50/40"
																	: ""
															} ${FLAG_STYLE[c.flag]} ${
																highlighted
																	? "z-20 animate-[np-pulse_1.2s_ease-in-out_3] rounded ring-2 ring-blue-600 ring-offset-1"
																	: ""
															} ${flashing ? "bg-blue-100" : ""}`}
														>
															{c.flag !== "ok" && (
																<span
																	className={`absolute left-1 top-1.5 h-1.5 w-1.5 rounded-full ${FLAG_DOT[c.flag]}`}
																/>
															)}
															<span className="whitespace-normal break-words">
																{fmt(c.value)}
															</span>
														</td>
													);
												})}
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					</section>
				);
			})}
			<style>{`@keyframes np-pulse{0%,100%{box-shadow:0 0 0 0 rgba(13,148,136,.55)}50%{box-shadow:0 0 0 8px rgba(13,148,136,0)}}`}</style>
		</div>
	);
}
