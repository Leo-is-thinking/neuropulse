"use client";
// Compares two daily-life recordings (different sentences) on measures that do not depend on the words:
// speech rate, silence share, volume and fade within a sentence.
import { Play, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	VOICE_BASELINE,
	VOICE_REFERENCES,
	type VoiceSample,
} from "@/data/modelization";
import { renderBold } from "@/lib/renderBold";

const WINDOW_S = 6;
const WORDS_PER_SENTENCE = 8;
const VOWELS: [number, number][] = [
	[700, 1100],
	[400, 2000],
	[300, 2300],
	[500, 900],
	[600, 1500],
];

interface Word {
	at: number;
	len: number;
	gain: number;
}

function layout(s: VoiceSample): Word[] {
	const slot = 60 / s.rate;
	const out: Word[] = [];
	for (let i = 0; i * slot < WINDOW_S; i++) {
		out.push({
			at: i * slot,
			len: Math.min(slot * (1 - s.pauseShare), WINDOW_S - i * slot),
			gain: 1 - (s.fade * (i % WORDS_PER_SENTENCE)) / (WORDS_PER_SENTENCE - 1),
		});
	}
	return out;
}

function synth(ctx: AudioContext, s: VoiceSample) {
	const t0 = ctx.currentTime + 0.05;
	const level = 0.22 * 10 ** ((s.volumeDb - 64) / 20);
	for (const [i, w] of layout(s).entries()) {
		const [f1, f2] = VOWELS[i % VOWELS.length];
		const osc = ctx.createOscillator();
		osc.type = "sawtooth";
		osc.frequency.value = 112 + 9 * Math.sin(i * 1.7);
		const g = ctx.createGain();
		const peak = level * w.gain ** 1.5;
		g.gain.setValueAtTime(0.0001, t0 + w.at);
		g.gain.linearRampToValueAtTime(peak, t0 + w.at + 0.04);
		g.gain.setValueAtTime(peak, t0 + w.at + Math.max(0.05, w.len - 0.08));
		g.gain.linearRampToValueAtTime(0.0001, t0 + w.at + w.len);
		for (const f of [f1, f2]) {
			const bp = ctx.createBiquadFilter();
			bp.type = "bandpass";
			bp.frequency.value = f;
			bp.Q.value = 5;
			osc.connect(bp).connect(g);
		}
		g.connect(ctx.destination);
		osc.start(t0 + w.at);
		osc.stop(t0 + w.at + w.len + 0.05);
	}
}

function Rhythm({ s, playing }: { s: VoiceSample; playing: boolean }) {
	const col = s.rate < 84 ? "#dc2626" : s.rate < 102 ? "#d97706" : "#2563eb";
	return (
		<svg
			viewBox={`0 0 ${WINDOW_S * 100} 64`}
			className="h-16 w-full"
			role="img"
			aria-label={`${Math.round(s.rate)} words per minute, silence ${Math.round(s.pauseShare * 100)}% of the time`}
		>
			<line x1="0" x2={WINDOW_S * 100} y1="32" y2="32" stroke="#e2e8f0" />
			{layout(s).map((w) => {
				const hgt = 6 + 52 * w.gain * (s.volumeDb / 64);
				return (
					<rect
						key={w.at}
						x={w.at * 100}
						y={32 - hgt / 2}
						width={w.len * 100}
						height={hgt}
						rx="6"
						fill={col}
						fillOpacity={0.3 + 0.7 * w.gain}
					/>
				);
			})}
			{playing && (
				<line x1="0" x2="0" y1="0" y2="64" stroke="#0f172a" strokeWidth="2">
					<animate
						attributeName="x1"
						from="0"
						to={WINDOW_S * 100}
						dur={`${WINDOW_S}s`}
						fill="freeze"
					/>
					<animate
						attributeName="x2"
						from="0"
						to={WINDOW_S * 100}
						dur={`${WINDOW_S}s`}
						fill="freeze"
					/>
				</line>
			)}
		</svg>
	);
}

const pct = (a: number, b: number) => Math.round(((b - a) / a) * 100);

export default function VoiceCompare({ recent }: { recent: VoiceSample }) {
	const earlier = VOICE_REFERENCES;
	const [refId, setRefId] = useState(earlier[0].id);
	const wpm = (r: number) => Math.round(r);
	const ref = earlier.find((s) => s.id === refId) ?? earlier[0];
	const [playingId, setPlayingId] = useState<string | null>(null);
	const ctxRef = useRef<AudioContext | null>(null);
	const timer = useRef(0);

	const stop = useCallback(() => {
		clearTimeout(timer.current);
		ctxRef.current?.close();
		ctxRef.current = null;
		setPlayingId(null);
	}, []);
	useEffect(() => stop, [stop]);

	const play = (s: VoiceSample) => {
		stop();
		const ctx = new AudioContext();
		ctxRef.current = ctx;
		synth(ctx, s);
		setPlayingId(s.id);
		timer.current = window.setTimeout(stop, (WINDOW_S + 0.3) * 1000);
	};

	const notes = [
		`Speech rate **${wpm(ref.rate)} to ${wpm(recent.rate)} words/min** (**${pct(ref.rate, recent.rate)}%**). Typical adult conversation is about ${wpm(VOICE_BASELINE)}.`,
		`Silence takes **${Math.round(recent.pauseShare * 100)}%** of the recording, against **${Math.round(ref.pauseShare * 100)}%**: **${recent.pauseShare > ref.pauseShare ? "more" : "fewer"} pauses between words**.`,
		`Volume is **${Math.abs(ref.volumeDb - recent.volumeDb)} dB ${recent.volumeDb < ref.volumeDb ? "lower" : "higher"}**, and the voice **fades inside each sentence** (${Math.round(recent.fade * 100)}% loss, was ${Math.round(ref.fade * 100)}%).`,
		"Wake-up recordings are the slowest of the day: **71** words/min at 07:10, against **98** at 10:00.",
	];

	return (
		<div className="space-y-4">
			<fieldset className="flex flex-wrap items-center gap-2 border-0 p-0">
				<legend className="float-left mr-2 text-sm text-slate-600">
					Compare with
				</legend>
				{earlier.map((s) => (
					<button
						key={s.id}
						type="button"
						aria-pressed={s.id === refId}
						onClick={() => {
							stop();
							setRefId(s.id);
						}}
						className={`cursor-pointer rounded-full border px-3 py-1 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${
							s.id === refId
								? "border-blue-600 bg-blue-50 text-blue-800"
								: "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
						}`}
					>
						{s.label}
					</button>
				))}
			</fieldset>

			<div className="grid gap-4 md:grid-cols-2">
				{[ref, recent].map((s) => (
					<article
						key={s.id}
						className={`rounded-xl border p-4 ${s.id === recent.id ? "border-red-200 bg-red-50/40" : "border-slate-200 bg-white"}`}
					>
						<div className="flex items-start justify-between gap-3">
							<div>
								<h3 className="font-semibold text-slate-900">{s.label}</h3>
								<p className="text-xs text-slate-500">{s.when}</p>
							</div>
							<button
								type="button"
								onClick={() => (playingId === s.id ? stop() : play(s))}
								aria-label={`${playingId === s.id ? "Stop" : "Play"} recording: ${s.label}`}
								className="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
							>
								{playingId === s.id ? (
									<Square className="h-4 w-4" />
								) : (
									<Play className="h-4 w-4" />
								)}
							</button>
						</div>
						<p className="mt-3 text-sm italic text-slate-600">"{s.said}"</p>
						<div className="mt-2">
							<Rhythm s={s} playing={playingId === s.id} />
						</div>
						<dl className="mt-2 grid grid-cols-3 gap-2 text-center">
							{[
								{ k: "Speech rate", v: `${wpm(s.rate)}`, u: "words/min" },
								{
									k: "Silence",
									v: `${Math.round(s.pauseShare * 100)}`,
									u: "%",
								},
								{ k: "Volume", v: `${s.volumeDb}`, u: "dB" },
							].map((m) => (
								<div key={m.k}>
									<dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
										{m.k}
									</dt>
									<dd className="text-lg font-bold tabular-nums text-slate-900">
										{m.v}{" "}
										<span className="text-xs font-medium text-slate-500">
											{m.u}
										</span>
									</dd>
								</div>
							))}
						</dl>
					</article>
				))}
			</div>
			<p className="text-xs text-slate-500">
				Sentences differ on purpose: the measures use rhythm and volume, not the
				words. Playback is rebuilt from those measures, not the raw voice.
			</p>

			<ul className="space-y-1.5 border-t border-slate-100 pt-4 text-sm text-slate-700">
				{notes.map((n) => (
					<li key={n} className="flex gap-2">
						<span
							className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600"
							aria-hidden
						/>
						<span>{renderBold(n)}</span>
					</li>
				))}
			</ul>
		</div>
	);
}
