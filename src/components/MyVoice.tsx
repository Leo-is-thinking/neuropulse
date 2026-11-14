"use client";
// Records the user's real voice, transcribes it with Deepgram (server route) and tracks speech measures over recordings.
import { Mic, Play, Square, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface Rec {
	id: string;
	at: string;
	wpm: number;
	pause: number;
	db: number;
	fade: number;
	text: string;
	audio: string;
}
const KEY = "neuropulse.myvoice.v1";

async function analyse(blob: Blob) {
	const form = await fetch("/api/transcribe", {
		method: "POST",
		headers: { "Content-Type": blob.type || "audio/webm" },
		body: blob,
	});
	const j = await form.json();
	if (!form.ok) throw new Error(j.error ?? "transcribe_failed");
	const words = j.words as { start: number; end: number }[];
	if (words.length < 3) throw new Error("Not enough words heard");
	const span = words[words.length - 1].end - words[0].start;
	let silent = 0;
	for (let i = 1; i < words.length; i++) {
		const gap = words[i].start - words[i - 1].end;
		if (gap > 0.3) silent += gap;
	}
	const ctx = new AudioContext();
	const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
	ctx.close();
	const d = buf.getChannelData(0);
	const t0 = Math.floor(words[0].start * buf.sampleRate);
	const t1 = Math.min(
		d.length,
		Math.ceil(words[words.length - 1].end * buf.sampleRate),
	);
	const rms = (a: number, b: number) => {
		let s = 0;
		for (let i = a; i < b; i++) s += d[i] * d[i];
		return Math.sqrt(s / Math.max(1, b - a));
	};
	const third = Math.floor((t1 - t0) / 3);
	const first = rms(t0, t0 + third);
	const lastR = rms(t1 - third, t1);
	return {
		wpm: Math.round((words.length / span) * 60),
		pause: Math.round((silent / span) * 100) / 100,
		db: Math.round(20 * Math.log10(rms(t0, t1) || 1e-6) + 94 - 20),
		fade: Math.round(Math.max(0, 1 - lastR / (first || 1)) * 100) / 100,
		text: j.transcript as string,
	};
}

const toDataUrl = (b: Blob) =>
	new Promise<string>((res) => {
		const r = new FileReader();
		r.onload = () => res(String(r.result));
		r.readAsDataURL(b);
	});

export default function MyVoice() {
	const [recs, setRecs] = useState<Rec[]>([]);
	const [state, setState] = useState<"idle" | "rec" | "busy">("idle");
	const [err, setErr] = useState("");
	const [secs, setSecs] = useState(0);
	const mr = useRef<MediaRecorder | null>(null);
	const chunks = useRef<Blob[]>([]);
	const player = useRef<HTMLAudioElement | null>(null);

	useEffect(() => {
		try {
			const raw = localStorage.getItem(KEY);
			if (raw) setRecs(JSON.parse(raw));
		} catch {}
	}, []);
	const persist = (r: Rec[]) => {
		setRecs(r);
		try {
			localStorage.setItem(KEY, JSON.stringify(r));
		} catch {
			setErr("Storage full: older audio not kept, measures kept.");
			try {
				localStorage.setItem(
					KEY,
					JSON.stringify(r.map((x) => ({ ...x, audio: "" }))),
				);
			} catch {}
		}
	};
	useEffect(() => {
		if (state !== "rec") return;
		setSecs(0);
		const id = setInterval(() => setSecs((s) => s + 1), 1000);
		return () => clearInterval(id);
	}, [state]);

	async function start() {
		setErr("");
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			const rec = new MediaRecorder(stream);
			chunks.current = [];
			rec.ondataavailable = (e) => chunks.current.push(e.data);
			rec.onstop = async () => {
				for (const t of stream.getTracks()) t.stop();
				setState("busy");
				try {
					const blob = new Blob(chunks.current, { type: rec.mimeType });
					const m = await analyse(blob);
					const audio = await toDataUrl(blob);
					persist([
						...recs,
						{
							id: String(Date.now()),
							at: new Date().toLocaleString("en-GB", {
								day: "2-digit",
								month: "short",
								hour: "2-digit",
								minute: "2-digit",
							}),
							audio: audio.length < 700_000 ? audio : "",
							...m,
						},
					]);
				} catch (e) {
					setErr(e instanceof Error ? e.message : "Analysis failed");
				}
				setState("idle");
			};
			rec.start();
			mr.current = rec;
			setState("rec");
		} catch {
			setErr("Microphone not available or refused.");
		}
	}
	const stop = () => mr.current?.stop();
	const play = (r: Rec) => {
		if (!r.audio) return;
		player.current?.pause();
		player.current = new Audio(r.audio);
		player.current.play();
	};

	const base = recs[0];
	const maxWpm = Math.max(130, ...recs.map((r) => r.wpm));
	const delta = (v: number, b: number, unit = "") =>
		recs.length > 1 && v !== b
			? ` (${v > b ? "+" : ""}${Math.round((v - b) * 100) / 100}${unit})`
			: "";

	return (
		<div className="space-y-4 rounded-2xl bg-slate-950 p-5 text-slate-200">
			<div className="flex flex-wrap items-center gap-3">
				{state === "rec" ? (
					<button
						type="button"
						onClick={stop}
						className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
					>
						<Square className="h-4 w-4" /> Stop ({secs}s)
					</button>
				) : (
					<button
						type="button"
						disabled={state === "busy"}
						onClick={start}
						className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
					>
						<Mic className="h-4 w-4" />
						{state === "busy" ? "Analysing with Deepgram…" : "Record my voice"}
					</button>
				)}
				<p className="text-sm text-slate-400">
					Say any sentence for 8 to 20 seconds. Same voice, louder then weaker,
					to see the change.
				</p>
				{recs.length > 0 && (
					<button
						type="button"
						onClick={() => persist([])}
						className="ml-auto inline-flex cursor-pointer items-center gap-1.5 text-sm text-slate-400 hover:text-white"
					>
						<Trash2 className="h-4 w-4" /> Clear
					</button>
				)}
			</div>
			{err && (
				<p role="alert" className="text-sm text-red-400">
					{err}
				</p>
			)}
			{recs.length === 0 ? (
				<p className="text-sm text-slate-500">
					No recording yet. Audio goes to Deepgram for transcription.
				</p>
			) : (
				<ul className="space-y-2">
					{recs.map((r, i) => (
						<li
							key={r.id}
							className="rounded-xl border border-slate-800 bg-slate-900 p-3"
						>
							<div className="flex flex-wrap items-center gap-3 text-sm">
								<button
									type="button"
									onClick={() => play(r)}
									disabled={!r.audio}
									aria-label={`Play recording ${i + 1}`}
									className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-blue-500 text-white disabled:opacity-40"
								>
									<Play className="h-4 w-4" />
								</button>
								<span className="font-semibold text-white">
									#{i + 1}{" "}
									<span className="font-normal text-slate-400">{r.at}</span>
								</span>
								<span className="tabular-nums">
									<b className="text-white">{r.wpm}</b> words/min
									{base && i > 0 ? delta(r.wpm, base.wpm) : ""}
								</span>
								<span className="tabular-nums text-slate-400">
									pauses {Math.round(r.pause * 100)}%
									{base && i > 0
										? delta(
												Math.round(r.pause * 100),
												Math.round(base.pause * 100),
												" pts",
											)
										: ""}
								</span>
								<span className="tabular-nums text-slate-400">
									volume {r.db} dB{base && i > 0 ? delta(r.db, base.db) : ""}
								</span>
								<span className="tabular-nums text-slate-400">
									fade {Math.round(r.fade * 100)}%
								</span>
							</div>
							<div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
								<div
									className="h-full rounded-full bg-blue-500"
									style={{ width: `${(r.wpm / maxWpm) * 100}%` }}
								/>
							</div>
							<p className="mt-1.5 truncate text-xs text-slate-500">{r.text}</p>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
