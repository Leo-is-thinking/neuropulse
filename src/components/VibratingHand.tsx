"use client";
// T4 · 3D-perspective vibrating hand + glass-shatter replay. CSS-3D layers + inline SVG, no 3D lib.
import { Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

export interface VibratingHandProps {
	/** Detected tremor frequency, e.g. 5.3 */
	hz: number;
	/** "HH:MM" of the spike, e.g. "16:40" */
	spikeTime: string;
	windowStart?: string;
	windowEnd?: string;
}

const REPLAY_MS = 9000; // 60 min of clinical time replayed in 9 s
const mins = (t: string) => {
	const [h, m] = t.split(":").map(Number);
	return h * 60 + m;
};

/** Synthesized glass shatter: filtered noise impact + randomized high sine "shards". */
function playShatter(ctx: AudioContext) {
	const t0 = ctx.currentTime;
	const master = ctx.createGain();
	master.gain.value = 0.55;
	master.connect(ctx.destination);

	const len = Math.floor(ctx.sampleRate * 0.5);
	const buf = ctx.createBuffer(1, len, ctx.sampleRate);
	const d = buf.getChannelData(0);
	for (let i = 0; i < len; i++)
		d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
	const noise = ctx.createBufferSource();
	noise.buffer = buf;
	const hp = ctx.createBiquadFilter();
	hp.type = "highpass";
	hp.frequency.value = 2200;
	const ng = ctx.createGain();
	ng.gain.setValueAtTime(1, t0);
	ng.gain.exponentialRampToValueAtTime(0.001, t0 + 0.45);
	noise.connect(hp).connect(ng).connect(master);
	noise.start(t0);

	for (let i = 0; i < 26; i++) {
		const at = t0 + 0.02 + Math.random() * 0.75;
		const osc = ctx.createOscillator();
		osc.type = "sine";
		osc.frequency.value = 2400 + Math.random() * 7000;
		const g = ctx.createGain();
		const peak = 0.05 + Math.random() * 0.13;
		g.gain.setValueAtTime(0.0001, at);
		g.gain.exponentialRampToValueAtTime(peak, at + 0.004);
		g.gain.exponentialRampToValueAtTime(
			0.0001,
			at + 0.05 + Math.random() * 0.18,
		);
		osc.connect(g).connect(master);
		osc.start(at);
		osc.stop(at + 0.3);
	}
}

const SHARDS = [
	{ x: -46, y: 18, r: -80 },
	{ x: 52, y: 10, r: 110 },
	{ x: -22, y: 36, r: 60 },
	{ x: 30, y: 40, r: -140 },
	{ x: -62, y: 44, r: 200 },
	{ x: 66, y: 46, r: -30 },
	{ x: 8, y: 30, r: 160 },
	{ x: -34, y: 52, r: -190 },
];

export default function VibratingHand({
	hz,
	spikeTime,
	windowStart = "16:00",
	windowEnd = "17:00",
}: VibratingHandProps) {
	const start = mins(windowStart);
	const span = mins(windowEnd) - start;
	const spikeAt = Math.min(1, Math.max(0, (mins(spikeTime) - start) / span));

	const [prog, setProg] = useState<number | null>(null); // null = idle (showing spike state)
	const [playing, setPlaying] = useState(false);
	const [sound, setSound] = useState(true);
	const [reduced, setReduced] = useState(false);
	const [burst, setBurst] = useState(0); // increments to retrigger shatter animation
	const ctxRef = useRef<AudioContext | null>(null);
	const rafRef = useRef<number | null>(null);
	const firedRef = useRef(false);
	const soundRef = useRef(sound);
	soundRef.current = sound;

	useEffect(() => {
		const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
		setReduced(mq.matches);
		const h = (e: MediaQueryListEvent) => setReduced(e.matches);
		mq.addEventListener("change", h);
		return () => mq.removeEventListener("change", h);
	}, []);

	const stop = useCallback(() => {
		if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
		rafRef.current = null;
		setPlaying(false);
	}, []);
	useEffect(() => stop, [stop]);

	const fire = useCallback(() => {
		setBurst((b) => b + 1);
		if (!soundRef.current) return;
		try {
			const AC =
				window.AudioContext ??
				(window as unknown as { webkitAudioContext: typeof AudioContext })
					.webkitAudioContext;
			ctxRef.current ??= new AC();
			void ctxRef.current.resume();
			playShatter(ctxRef.current);
		} catch {
			/* audio unavailable: visual replay still works */
		}
	}, []);

	const replay = () => {
		stop();
		firedRef.current = false;
		setProg(0);
		setPlaying(true);
		const t0 = performance.now();
		const tick = (now: number) => {
			const p = Math.min(1, (now - t0) / REPLAY_MS);
			setProg(p);
			if (!firedRef.current && p >= spikeAt) {
				firedRef.current = true;
				fire();
			}
			if (p < 1) rafRef.current = requestAnimationFrame(tick);
			else stop();
		};
		rafRef.current = requestAnimationFrame(tick);
	};

	const shown = prog ?? 1;
	const trembling = prog === null || prog >= spikeAt;
	const broken = prog === null || prog >= spikeAt;
	const clock = (() => {
		const m = Math.round(start + shown * span);
		return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
	})();
	const period = 1 / (2 * hz); // alternate → full cycle = 1/hz
	const anim =
		reduced || !trembling
			? "none"
			: `np-tremor ${period}s ease-in-out infinite alternate`;
	const ticks = Array.from({ length: 5 }, (_, i) => start + (span * i) / 4);

	return (
		<section
			className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
			aria-label="Wrist tremor replay"
		>
			<style>{`
        @keyframes np-tremor{from{transform:rotate(-3.2deg) translateX(-1.5px)}to{transform:rotate(3.2deg) translateX(1.5px)}}
        @keyframes np-finger{from{transform:rotate(-4deg)}to{transform:rotate(5deg)}}
        @keyframes np-fall{0%{transform:translateY(0) rotate(0)}70%{transform:translateY(118px) rotate(14deg);opacity:1}100%{transform:translateY(128px) rotate(18deg);opacity:0}}
        @keyframes np-shard{0%{opacity:0;transform:translate(0,0) rotate(0)}12%{opacity:1}100%{opacity:0;transform:translate(var(--sx),var(--sy)) rotate(var(--sr))}}
        @keyframes np-led{0%,100%{opacity:.35}50%{opacity:1}}
        @media (prefers-reduced-motion: reduce){.np-anim{animation:none!important}}
      `}</style>

			<div className="flex items-start justify-between gap-3">
				<div>
					<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
						Tremor · wrist IMU
					</p>
					<p className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">
						{hz.toFixed(1)}{" "}
						<span className="text-base font-medium text-slate-500">Hz</span>
					</p>
				</div>
				<span
					className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
						trembling
							? "border-red-200 bg-red-50 text-red-700"
							: "border-emerald-200 bg-emerald-50 text-emerald-700"
					}`}
				>
					{trembling ? "Resting tremor 4–6 Hz" : "At rest"}
				</span>
			</div>

			<div
				className="relative mx-auto mt-3 h-64 w-full max-w-sm select-none"
				style={{ perspective: 900 }}
				role="img"
				aria-label={`3D articulated hand with Vexo band trembling at ${hz.toFixed(1)} hertz${broken ? ", glass dropped" : ""}`}
			>
				<div
					className="absolute inset-0"
					style={{
						transformStyle: "preserve-3d",
						transform: "rotateX(16deg) rotateY(-24deg)",
					}}
				>
					{/* floor plane */}
					<div
						className="absolute bottom-2 left-1/2 h-40 w-64 -translate-x-1/2 rounded-xl border border-slate-200 bg-slate-50"
						style={{
							transform: "rotateX(80deg) translateZ(-60px)",
							backgroundImage:
								"linear-gradient(#e2e8f0 1px,transparent 1px),linear-gradient(90deg,#e2e8f0 1px,transparent 1px)",
							backgroundSize: "20px 20px",
						}}
					/>
					{/* hand layer */}
					<svg
						viewBox="0 0 320 300"
						className="absolute inset-0 h-full w-full"
						aria-hidden="true"
					>
						<g
							className="np-anim"
							style={{ transformOrigin: "160px 215px", animation: anim }}
						>
							<path
								d="M122 205 L118 300 H202 L198 205 Z"
								fill="#f1f5f9"
								stroke="#94a3b8"
								strokeWidth="2"
							/>
							{[
								{ x: 122, y: 62, h: 70, d: 0 },
								{ x: 144, y: 46, h: 86, d: 0.04 },
								{ x: 166, y: 52, h: 80, d: 0.08 },
								{ x: 188, y: 74, h: 60, d: 0.12 },
							].map((f) => (
								<rect
									key={f.x}
									className="np-anim"
									x={f.x}
									y={f.y}
									width="18"
									height={f.h + 14}
									rx="9"
									fill="#f1f5f9"
									stroke="#94a3b8"
									strokeWidth="2"
									style={{
										transformOrigin: `${f.x + 9}px ${f.y + f.h + 12}px`,
										animation:
											reduced || !trembling
												? "none"
												: `np-finger ${period}s ease-in-out ${f.d}s infinite alternate`,
									}}
								/>
							))}
							<rect
								x="104"
								y="108"
								width="20"
								height="68"
								rx="10"
								transform="rotate(-38 114 176)"
								fill="#f1f5f9"
								stroke="#94a3b8"
								strokeWidth="2"
							/>
							<rect
								x="116"
								y="118"
								width="94"
								height="94"
								rx="24"
								fill="#f1f5f9"
								stroke="#94a3b8"
								strokeWidth="2"
							/>
							{[0, 1, 2].map((i) => (
								<path
									key={i}
									d={`M${140 + i * 22} 128 v26`}
									stroke="#cbd5e1"
									strokeWidth="1.5"
									strokeLinecap="round"
								/>
							))}
							{/* Vexo band */}
							<rect
								x="114"
								y="212"
								width="92"
								height="30"
								rx="8"
								fill="#0d9488"
							/>
							<rect
								x="124"
								y="222"
								width="30"
								height="10"
								rx="3"
								fill="#0f172a"
								opacity="0.85"
							/>
							<circle
								cx="188"
								cy="227"
								r="5"
								fill="#fbbf24"
								className="np-anim"
								style={{
									animation: reduced
										? "none"
										: "np-led 1.2s ease-in-out infinite",
								}}
							/>
						</g>
					</svg>
					{/* glass + shards layer, nearer to camera */}
					<svg
						viewBox="0 0 320 300"
						className="absolute inset-0 h-full w-full"
						style={{ transform: "translateZ(46px)" }}
						aria-hidden="true"
					>
						{!broken && (
							<g
								className="np-anim"
								style={{ transformOrigin: "160px 215px", animation: anim }}
							>
								<path
									d="M214 108 h34 l-5 54 h-24 Z"
									fill="#e0f2fe"
									fillOpacity="0.7"
									stroke="#0d9488"
									strokeWidth="2"
								/>
								<path
									d="M219 126 h24"
									stroke="#0d9488"
									strokeWidth="1.5"
									opacity="0.5"
								/>
							</g>
						)}
						{broken && burst > 0 && (
							<g key={`b${burst}`}>
								<g
									className="np-anim"
									style={{
										animation: reduced
											? "none"
											: "np-fall .5s cubic-bezier(.5,0,.9,.6) forwards",
									}}
								>
									<path
										d="M214 108 h34 l-5 54 h-24 Z"
										fill="#e0f2fe"
										fillOpacity="0.7"
										stroke="#0d9488"
										strokeWidth="2"
									/>
								</g>
								{SHARDS.map((s, i) => (
									<polygon
										key={i}
										className="np-anim"
										points="0,0 9,3 4,10"
										fill="#bae6fd"
										stroke="#0d9488"
										strokeWidth="1"
										style={
											{
												transform: `translate(${230}px,${262}px)`,
												transformBox: "fill-box",
												animation: reduced
													? "none"
													: `np-shard .9s ease-out ${0.42 + i * 0.015}s forwards`,
												opacity: 0,
												"--sx": `${s.x}px`,
												"--sy": `${s.y}px`,
												"--sr": `${s.r}deg`,
											} as React.CSSProperties
										}
									/>
								))}
							</g>
						)}
						{broken && burst === 0 && (
							<g opacity="0.9">
								{SHARDS.slice(0, 6).map((s, i) => (
									<polygon
										key={i}
										points="0,0 9,3 4,10"
										fill="#bae6fd"
										stroke="#0d9488"
										strokeWidth="1"
										transform={`translate(${230 + s.x},${270 + s.y / 3}) rotate(${s.r})`}
									/>
								))}
							</g>
						)}
					</svg>
				</div>
				{broken && (
					<span className="absolute right-2 top-2 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
						Glass break detected
					</span>
				)}
			</div>

			{/* 16:00–17:00 mini timeline */}
			<div className="mt-4">
				<div className="relative h-7">
					<div className="absolute inset-x-0 top-3 h-1.5 rounded-full bg-slate-100" />
					<div
						className="absolute top-3 h-1.5 rounded-full bg-red-200"
						style={{ left: `${spikeAt * 100}%`, right: 0 }}
						aria-hidden="true"
					/>
					<div
						className="absolute top-3 h-1.5 rounded-full bg-blue-600"
						style={{ left: 0, width: `${shown * 100}%` }}
					/>
					<div
						className="absolute top-0 h-7 w-0.5 bg-red-500"
						style={{ left: `${spikeAt * 100}%` }}
						title={`${spikeTime} spike`}
						aria-hidden="true"
					/>
					<div
						className="absolute top-1.5 size-4 -translate-x-1/2 rounded-full border-2 border-white bg-blue-600 shadow"
						style={{ left: `${shown * 100}%` }}
						aria-hidden="true"
					/>
				</div>
				<div className="relative mt-1 h-4 text-xs tabular-nums text-slate-500">
					{ticks.map((t, i) => (
						<span
							key={t}
							className="absolute -translate-x-1/2"
							style={{
								left: `${(i / 4) * 100}%`,
								...(i === 0
									? { transform: "none" }
									: i === 4
										? { transform: "translateX(-100%)" }
										: {}),
							}}
						>
							{String(Math.floor(t / 60)).padStart(2, "0")}:
							{String(t % 60).padStart(2, "0")}
						</span>
					))}
				</div>
				<div className="mt-2 flex items-center justify-between gap-2">
					<p className="text-sm text-slate-600">
						<span className="font-medium tabular-nums text-slate-900">
							{clock}
						</span>
						{prog === null
							? ` · spike at ${spikeTime}`
							: playing
								? " · replaying"
								: prog >= 1
									? " · replay complete"
									: ""}
					</p>
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={() => setSound((s) => !s)}
							aria-pressed={sound}
							aria-label={sound ? "Mute glass sound" : "Unmute glass sound"}
							className="inline-flex size-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors duration-150 hover:bg-slate-50"
						>
							{sound ? (
								<Volume2 className="size-4" />
							) : (
								<VolumeX className="size-4" />
							)}
						</button>
						<button
							type="button"
							onClick={playing ? stop : replay}
							className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-blue-700"
						>
							{playing ? (
								<Pause className="size-4" />
							) : prog !== null && prog >= 1 ? (
								<RotateCcw className="size-4" />
							) : (
								<Play className="size-4" />
							)}
							{playing ? "Pause" : `Replay ${windowStart}–${windowEnd}`}
						</button>
					</div>
				</div>
			</div>
		</section>
	);
}
