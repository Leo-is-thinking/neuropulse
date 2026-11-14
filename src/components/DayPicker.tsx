"use client";
// Week table (same cells as the patient dashboard). Click a day to model it; red = strongest.
import { type Cell, type Flag, WEEKDAYS, type Weekday } from "@/types/clinical";

const FLAG: Record<Flag, string> = {
	ok: "text-slate-700",
	warn: "bg-amber-50 text-amber-800 font-medium",
	alert: "bg-red-50 text-red-700 font-semibold",
};

export interface PickerRow {
	label: string;
	unit: string;
	cells: Partial<Record<Weekday, Cell>>;
	/** Multiplies the stored value for display (unit conversion). */
	scale?: number;
}

const show = (r: PickerRow, c: Cell) =>
	r.scale && typeof c.value === "number"
		? Math.round(c.value * r.scale)
		: c.value;

export default function DayPicker({
	rows,
	selected,
	onSelect,
	caption,
}: {
	rows: PickerRow[];
	selected: Weekday;
	onSelect: (d: Weekday) => void;
	caption: string;
}) {
	return (
		<div className="overflow-x-auto rounded-xl border border-slate-200">
			<table className="w-full min-w-[640px] border-collapse text-sm">
				<caption className="sr-only">{caption}</caption>
				<thead>
					<tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
						<th scope="col" className="px-3 py-2 text-left font-medium">
							Measure
						</th>
						{WEEKDAYS.map((d) => (
							<th
								key={d}
								scope="col"
								className={`px-2 py-2 text-center font-medium ${d === selected ? "text-blue-700" : ""}`}
							>
								{d}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.map((r) => (
						<tr key={r.label} className="border-t border-slate-100">
							<th
								scope="row"
								className="px-3 py-2 text-left font-medium text-slate-800"
							>
								{r.label}{" "}
								<span className="font-normal text-slate-400">{r.unit}</span>
							</th>
							{WEEKDAYS.map((d) => {
								const c = r.cells[d];
								const on = d === selected;
								return (
									<td key={d} className="p-1 text-center">
										{c ? (
											<button
												type="button"
												onClick={() => onSelect(d)}
												aria-pressed={on}
												aria-label={`${r.label}, ${d}: ${show(r, c)}. Model this day`}
												className={`w-full cursor-pointer rounded-md px-2 py-1.5 tabular-nums transition-shadow hover:ring-2 hover:ring-blue-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${FLAG[c.flag]} ${on ? "ring-2 ring-blue-600" : ""}`}
											>
												{show(r, c)}
											</button>
										) : (
											<span className="text-slate-300">–</span>
										)}
									</td>
								);
							})}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
