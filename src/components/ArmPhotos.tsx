"use client";
// The reference photos a forearm model was measured on, with what each one gave. Shows the model is this person's arm.
import { useState } from "react";
import type { ArmProfile } from "@/data/armProfile";

export default function ArmPhotos({ profile }: { profile: ArmProfile }) {
	const [open, setOpen] = useState<number | null>(null);
	const ph = profile.photos;
	if (!ph) return null;
	const url = (f: string) =>
		`/api/patient-photos?patientId=${ph.patientId}&file=${f}`;
	const cur = open === null ? null : ph.items[open];
	return (
		<div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
			<p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
				Model measured on these photos ({ph.items.length})
			</p>
			<div className="flex gap-2 overflow-x-auto pb-1">
				{ph.items.map((it, i) => (
					<button
						key={it.file}
						type="button"
						onClick={() => setOpen(open === i ? null : i)}
						className={`shrink-0 cursor-pointer overflow-hidden rounded-lg border ${open === i ? "border-teal-400" : "border-slate-700"}`}
						title={it.used}
					>
						{/* biome-ignore lint/performance/noImgElement: private API image, not a static asset */}
						<img
							src={url(it.file)}
							alt={it.used}
							className="h-20 w-16 object-cover"
							loading="lazy"
						/>
					</button>
				))}
			</div>
			{cur && (
				<div className="mt-3 grid gap-3 sm:grid-cols-[200px_1fr]">
					{/* biome-ignore lint/performance/noImgElement: private API image, not a static asset */}
					<img
						src={url(cur.file)}
						alt={cur.used}
						className="max-h-72 w-full rounded-lg object-contain"
					/>
					<p className="text-sm text-slate-300">
						<span className="block text-xs text-slate-500">Used for</span>
						{cur.used}
					</p>
				</div>
			)}
		</div>
	);
}
