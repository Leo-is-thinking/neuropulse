"use client";
// T4 · Vocal-fold cross-section: healthy vs Parkinsonian atrophy (bowing, thin folds, weak closure). CSS-3D + SVG.
import { Mic } from "lucide-react";

export interface VocalCordVisualizerProps {
	/** words / min (patient) */
	speechRate: number;
	/** words / min (healthy), 132 */
	baseline: number;
	/** weekly change of daily verbal engagement in %, e.g. -38 */
	engagementDeltaPct: number;
}

interface FoldSpec {
	/** inner-edge bowing at mid-fold (px). Larger = wider glottal gap. */
	gap: number;
	/** fold thickness (px) */
	thick: number;
	/** vibration amplitude (px) */
	amp: number;
}

const HEALTHY: FoldSpec = { gap: 2, thick: 26, amp: 7 };
const ATROPHIC: FoldSpec = { gap: 15, thick: 12, amp: 1.5 };

function Larynx({
	spec,
	id,
	label,
	tone,
	reduced,
}: {
	spec: FoldSpec;
	id: string;
	label: string;
	tone: "ok" | "alert";
	reduced?: boolean;
}) {
	const { gap, thick, amp } = spec;
	const cx = 130;
	const fold = `M${cx} 52 Q${cx - 2 * gap} 130 ${cx} 208 L${cx - 18} 214 Q${cx - 2 * (gap + thick)} 130 ${cx - 15} 58 Z`;
	const dur = tone === "ok" ? 0.55 : 0.9; // slowed for display (real fundamental is ~100–200 Hz)
	const stroke = tone === "ok" ? "#0d9488" : "#ef4444";
	return (
		<figure className="min-w-0 flex-1">
			<div
				className="mx-auto w-full max-w-[250px]"
				style={{ perspective: 650 }}
			>
				<svg
					viewBox="0 0 260 260"
					className="w-full"
					style={{ transform: "rotateX(38deg)", transformOrigin: "50% 60%" }}
					role="img"
					aria-label={`${label}: ${tone === "ok" ? "folds close fully" : "thin folds with a wide glottal gap"}`}
				>
					<defs>
						<style>{`
              @keyframes np-fl-${id}{from{transform:translateX(0)}to{transform:translateX(${amp}px)}}
              @keyframes np-fr-${id}{from{transform:translateX(0)}to{transform:translateX(${-amp}px)}}
              .np-fl-${id}{animation:np-fl-${id} ${dur / 2}s ease-in-out infinite alternate}
              .np-fr-${id}{animation:np-fr-${id} ${dur / 2}s ease-in-out infinite alternate}
              @media (prefers-reduced-motion: reduce){.np-fl-${id},.np-fr-${id}{animation:none}}
            `}</style>
					</defs>
					{/* thyroid cartilage + airway */}
					<path
						d="M130 22 C 50 30 28 120 40 190 C 52 236 100 250 130 250 C 160 250 208 236 220 190 C 232 120 210 30 130 22 Z"
						fill="#f8fafc"
						stroke="#94a3b8"
						strokeWidth="2"
					/>
					<path
						d="M130 44 C 78 52 62 130 70 186 C 78 224 108 232 130 232 C 152 232 182 224 190 186 C 198 130 182 52 130 44 Z"
						fill="#0f172a"
						fillOpacity="0.88"
					/>
					{/* left fold */}
					<g className={`np-fl-${id}`}>
						<path
							d={fold}
							fill="#e2e8f0"
							stroke={stroke}
							strokeWidth="2"
							strokeLinejoin="round"
						/>
					</g>
					{/* right fold (mirrored) */}
					<g className={`np-fr-${id}`}>
						<g transform={`translate(${cx * 2},0) scale(-1,1)`}>
							<path
								d={fold}
								fill="#e2e8f0"
								stroke={stroke}
								strokeWidth="2"
								strokeLinejoin="round"
							/>
						</g>
					</g>
					<text x="130" y="38" textAnchor="middle" fontSize="9" fill="#94a3b8">
						anterior
					</text>
					<text x="130" y="246" textAnchor="middle" fontSize="9" fill="#94a3b8">
						posterior
					</text>
					{tone === "alert" && (
						<g stroke="#ef4444" strokeWidth="1.5" fill="none">
							<path d="M96 128 H114 M164 128 H146" markerEnd="" />
							<text
								x="130"
								y="116"
								textAnchor="middle"
								fontSize="9"
								fill="#ef4444"
								stroke="none"
							>
								gap
							</text>
						</g>
					)}
				</svg>
			</div>
			<figcaption className="mt-1 text-center text-sm">
				<span
					className={`font-medium ${tone === "ok" ? "text-blue-700" : "text-red-700"}`}
				>
					{label}
				</span>
			</figcaption>
		</figure>
	);
}

export default function VocalCordVisualizer({
	speechRate,
	baseline,
	engagementDeltaPct,
}: VocalCordVisualizerProps) {
	const pct = Math.round(((speechRate - baseline) / baseline) * 100);
	const fill = Math.max(0, Math.min(100, (speechRate / baseline) * 100));
	return (
		<section
			className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
			aria-label="Vocal fold atrophy"
		>
			<div className="flex items-start justify-between gap-3">
				<div>
					<p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
						<Mic className="size-3.5" /> Voice · hypophonia
					</p>
					<p className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">
						{speechRate.toFixed(1)}{" "}
						<span className="text-base font-medium text-slate-500">
							words/min
						</span>
					</p>
				</div>
				<span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium tabular-nums text-red-700">
					{pct}% vs healthy
				</span>
			</div>

			<div className="mt-3 flex gap-3">
				<Larynx id="h" spec={HEALTHY} label="Healthy baseline" tone="ok" />
				<Larynx
					id="p"
					spec={ATROPHIC}
					label="Vocal fold atrophy"
					tone="alert"
				/>
			</div>
			<p className="mt-1 text-center text-xs text-slate-400">
				Laryngeal view from above · vibration slowed for display
			</p>

			<div className="mt-4 space-y-3">
				<div>
					<div className="flex justify-between text-xs text-slate-500">
						<span>Speech rate</span>
						<span className="tabular-nums">
							{speechRate.toFixed(1)} / {baseline.toFixed(1)}
						</span>
					</div>
					<div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
						<div
							className="h-full rounded-full bg-blue-600 transition-[width] duration-500"
							style={{ width: `${fill}%` }}
						/>
					</div>
				</div>
				<div className="grid grid-cols-2 gap-3">
					<div className="rounded-lg bg-slate-50 p-3">
						<p className="text-xs text-slate-500">Daily speech time</p>
						<p className="text-xl font-semibold tabular-nums text-red-700">
							{engagementDeltaPct}%
						</p>
					</div>
					<div className="rounded-lg bg-slate-50 p-3">
						<p className="text-xs text-slate-500">Glottal closure</p>
						<p className="text-xl font-semibold text-red-700">Incomplete</p>
					</div>
				</div>
				<p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
					Motor-only trackers miss this. The continuous wrist mic measures
					speech rate and speaking time without any active test.
				</p>
			</div>
		</section>
	);
}
