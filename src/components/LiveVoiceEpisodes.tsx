"use client";
// Speech phrases recorded live from the band: rate, transcript and audio. Slow phrases are flagged,
// the slowest one is one click away, and any two phrases can be heard side by side.
import { Shuffle, TrendingDown } from "lucide-react";
import { useEffect, useState } from "react";
import { voiceComments } from "@/lib/liveComments";
import { renderBold } from "@/lib/renderBold";
import type { VoiceEpisode } from "@/types/clinical";

const POLL_MS = 2000;
const NORMAL_WPM = 130;
const SLOW_WPM = 100;
const timeOf = (iso: string) =>
	new Date(iso).toLocaleTimeString("fr-FR", {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
const tone = (e: VoiceEpisode) => (e.slow ? "#d97706" : "#0f766e");

function Timeline({
	eps,
	picked,
	onPick,
}: {
	eps: VoiceEpisode[];
	picked: string[];
	onPick: (id: string) => void;
}) {
	const W = 360;
	const H = 150;
	const p = { l: 34, r: 8, t: 8, b: 14 };
	const max = Math.max(160, ...eps.map((e) => e.wpm));
	const x = (i: number) =>
		p.l + (eps.length < 2 ? 0.5 : i / (eps.length - 1)) * (W - p.l - p.r);
	const y = (v: number) => H - p.b - (v / max) * (H - p.t - p.b);
	return (
		<svg
			viewBox={`0 0 ${W} ${H}`}
			className="w-full"
			role="img"
			aria-label="Speech rate of each recorded phrase"
		>
			<line
				x1={p.l}
				x2={W - p.r}
				y1={y(SLOW_WPM)}
				y2={y(SLOW_WPM)}
				stroke="#d97706"
				strokeDasharray="4 3"
			/>
			<text x="2" y={y(SLOW_WPM) + 3} fontSize="9" fill="#d97706">
				{SLOW_WPM}
			</text>
			<line
				x1={p.l}
				x2={W - p.r}
				y1={y(NORMAL_WPM)}
				y2={y(NORMAL_WPM)}
				stroke="#cbd5e1"
				strokeDasharray="2 3"
			/>
			<text x="2" y={y(NORMAL_WPM) + 3} fontSize="9" fill="#64748b">
				{NORMAL_WPM}
			</text>
			<line x1={p.l} x2={p.l} y1={p.t} y2={H - p.b} stroke="#cbd5e1" />
			{eps.map((e, i) => (
				// biome-ignore lint/a11y/useSemanticElements: SVG dot cannot be a <button>
				<circle
					key={e.id}
					cx={x(i)}
					cy={y(e.wpm)}
					r={picked.includes(e.id as string) ? 6 : 4}
					fill={tone(e)}
					stroke={picked.includes(e.id as string) ? "#0f172a" : "none"}
					strokeWidth="2"
					className="cursor-pointer"
					role="button"
					tabIndex={0}
					aria-label={`${e.wpm} words per minute at ${timeOf(e.start)}`}
					onClick={() => onPick(e.id as string)}
					onKeyDown={(k) => k.key === "Enter" && onPick(e.id as string)}
				>
					<title>{`${timeOf(e.start)} · ${e.wpm} words/min`}</title>
				</circle>
			))}
			<text x={W / 2} y={H - 1} fontSize="9" textAnchor="middle" fill="#64748b">
				Phrases in order — dashed orange: slow speech under {SLOW_WPM} words/min
			</text>
		</svg>
	);
}

function Clip({ e, label }: { e: VoiceEpisode; label: string }) {
	return (
		<div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
			<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
				{label}
			</p>
			<p
				className="mt-1 text-2xl font-bold tabular-nums"
				style={{ color: tone(e) }}
			>
				{e.wpm} <span className="text-sm font-medium">words/min</span>
			</p>
			<p className="text-xs text-slate-500">
				{timeOf(e.start)} · {e.words} words in {e.secs} s
			</p>
			{typeof e.db_avg === "number" && (
				<p className="text-xs text-slate-500">
					Volume {e.db_avg} dB avg, {e.db_peak} dB peak (band mic, relative)
				</p>
			)}
			<p className="mt-2 text-sm text-slate-700">“{e.text}”</p>
			{e.hasAudio ? (
				// biome-ignore lint/a11y/useMediaCaption: transcript shown above
				<audio
					controls
					preload="none"
					className="mt-2 w-full"
					src={`/api/voice-episodes?clip=${encodeURIComponent(e.id as string)}`}
				/>
			) : (
				<p className="mt-2 text-xs text-slate-400">
					No audio kept for this phrase
				</p>
			)}
		</div>
	);
}

export default function LiveVoiceEpisodes({
	patientId,
	comments = false,
}: {
	patientId: string;
	/** show the written synthesis and pre-select slowest vs fastest phrase */
	comments?: boolean;
}) {
	const [eps, setEps] = useState<VoiceEpisode[]>([]);
	const [picked, setPicked] = useState<string[]>([]);
	useEffect(() => {
		let alive = true;
		const tick = async () => {
			try {
				const r = await fetch(
					`/api/voice-episodes?patientId=${encodeURIComponent(patientId)}`,
					{ cache: "no-store" },
				);
				if (r.ok && alive) setEps((await r.json()) as VoiceEpisode[]);
			} catch {
				/* keep last list */
			}
		};
		tick();
		const t = setInterval(tick, POLL_MS);
		return () => {
			alive = false;
			clearInterval(t);
		};
	}, [patientId]);

	if (eps.length === 0)
		return (
			<p className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
				No phrase recorded yet. Speak near the band with the speech capture on:
				each phrase of 4 words or more appears here with its rate and audio.
			</p>
		);
	const slowest = eps.reduce((b, e) => (e.wpm < b.wpm ? e : b), eps[0]);
	const pick = (id: string) =>
		setPicked((p) =>
			p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(-2),
		);
	const randomPair = () => {
		const s = [...eps].sort(() => Math.random() - 0.5).slice(0, 2);
		setPicked(s.map((e) => e.id as string));
	};
	const slowVsRandom = () => {
		const others = eps.filter((e) => e.id !== slowest.id);
		const o = others[Math.floor(Math.random() * others.length)];
		setPicked([slowest.id as string, ...(o ? [o.id as string] : [])]);
	};
	const fastest = eps.reduce((b, e) => (e.wpm > b.wpm ? e : b), eps[0]);
	const autoPair =
		comments && picked.length === 0 && fastest.id !== slowest.id
			? [slowest.id as string, fastest.id as string]
			: picked;
	const sel = autoPair
		.map((id) => eps.find((e) => e.id === id))
		.filter(Boolean) as VoiceEpisode[];
	const nSlow = eps.filter((e) => e.slow).length;
	return (
		<div className="space-y-4">
			<div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_1fr]">
				<div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
					<Timeline eps={eps} picked={picked} onPick={pick} />
					<p className="mt-2 text-xs text-slate-500">
						{eps.length} phrases, {nSlow} slow. Slowest:{" "}
						<b>{slowest.wpm} words/min</b> at {timeOf(slowest.start)}. Click
						dots to pick two.
					</p>
					<div className="mt-3 flex flex-wrap gap-2">
						<button
							type="button"
							onClick={() => setPicked([slowest.id as string])}
							className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
						>
							<TrendingDown className="h-3.5 w-3.5" /> Slowest moment
						</button>
						<button
							type="button"
							onClick={slowVsRandom}
							className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
						>
							<TrendingDown className="h-3.5 w-3.5" /> Slowest vs random
						</button>
						<button
							type="button"
							onClick={randomPair}
							className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
						>
							<Shuffle className="h-3.5 w-3.5" /> Two random
						</button>
					</div>
				</div>
				<div className={`grid gap-4 ${sel.length > 1 ? "md:grid-cols-2" : ""}`}>
					{sel.length === 0 && (
						<p className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
							Pick a phrase on the chart, or use a button, to hear it.
						</p>
					)}
					{sel.map((e, i) => (
						<Clip
							key={e.id}
							e={e}
							label={e.id === slowest.id ? "Slowest phrase" : `Phrase ${i + 1}`}
						/>
					))}
				</div>
			</div>
			{comments && (
				<ul className="space-y-1.5 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm">
					{voiceComments(eps).map((n) => (
						<li key={n} className="flex gap-2">
							<span
								className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-600"
								aria-hidden
							/>
							<span>{renderBold(n)}</span>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
