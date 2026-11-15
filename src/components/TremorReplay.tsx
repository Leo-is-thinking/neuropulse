"use client";
// Replays one tremor episode on an anatomical forearm. Still until Play is pressed, then the recorded motion is
// played back sample by sample: forearm orientation from the band (accel + gyro), wrist path, hand and fingers,
// and the forearm muscles swelling as they fire. Band episodes use their raw IMU; demo patients without raw data
// get a physically consistent clip built from their summary (labelled as modelled).
import { Pause, Play, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ArmPhotos from "@/components/ArmPhotos";
import ForearmModel, {
	type ModelState,
	type ModelView,
} from "@/components/ForearmModel";
import { ARMELLE, type ArmProfile, GENERIC_ELDER } from "@/data/armProfile";
import type { TremorHighlight } from "@/data/modelization";
import { tremorComments } from "@/lib/liveComments";
import {
	amplified,
	frameAt,
	inferPosture,
	MUSCLES,
	type Posture,
	reconstruct,
	synthClip,
} from "@/lib/motionReplay";
import { renderBold } from "@/lib/renderBold";
import type { TremorEpisode } from "@/types/clinical";

const COLOURS = ["#5aa2ff", "#ff9a4d", "#4cc47f"]; // x, y, z: Vexo dashboard dark palette
const AXES = ["x", "y", "z"] as const;
const WINDOW_S = 4; // graph shows the last 4 s, like the kit's
const PRE_S = 2; // band clips start 2 s before the episode (bridge IMU_PRE_S)
const SPEEDS = [1, 0.5, 0.25] as const;
const GAINS = [1, 3, 6] as const;
const GROUP_COLOUR: Record<string, string> = {
	flexor: "#f97316",
	extensor: "#38bdf8",
	pronator: "#a78bfa",
	supinator: "#34d399",
	postural: "#facc15",
};

const hash = (s: string) =>
	[...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export default function TremorReplay({
	h,
	episode,
}: {
	h?: TremorHighlight;
	episode?: TremorEpisode;
}) {
	const fromBand = !!episode?.imu?.s?.length;
	const rec = useMemo(
		() =>
			fromBand && episode?.imu
				? episode.imu
				: synthClip({
						hz: h?.hz ?? episode?.hz ?? 5,
						amp: h?.ampG ?? episode?.amp_peak ?? 0.15,
						seed: hash(h?.id ?? episode?.id ?? "x"),
						pitch: episode?.pitch,
						roll: episode?.roll,
					}),
		[fromBand, episode, h],
	);
	const replay = useMemo(() => reconstruct(rec), [rec]);
	const dur = replay.duration;

	const [playing, setPlaying] = useState(false);
	const [started, setStarted] = useState(false);
	const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
	const [gain, setGain] = useState<(typeof GAINS)[number]>(3);
	const [view, setView] = useState<ModelView>("muscles");
	const [side, setSide] = useState<"left" | "right">("right");
	const [profile, setProfile] = useState<ArmProfile>(
		episode ? ARMELLE : GENERIC_ELDER,
	);
	const [gyroView, setGyroView] = useState(false);
	const [trail, setTrail] = useState(true);
	const guess = useMemo(
		() => inferPosture(replay, episode?.activity),
		[replay, episode?.activity],
	);
	const [postureSel, setPostureSel] = useState<Posture | "auto">("auto");
	const posture = postureSel === "auto" ? guess.posture : postureSel;
	const [cam, setCam] = useState<"body" | "arm">("body");

	const t = useRef(0);
	const tick = useRef(0);
	const f0 = replay.frames[0];
	const state = useRef<ModelState>({
		q: f0.q,
		flex: 0,
		dev: 0,
		pro: 0,
		level: 0,
		act: f0.act,
		disp: [0, 0, 0],
	});
	const canvas = useRef<HTMLCanvasElement>(null);
	const slider = useRef<HTMLInputElement>(null);
	const clock = useRef<HTMLSpanElement>(null);
	const readout = useRef<(HTMLElement | null)[]>([]);
	const levelEl = useRef<HTMLSpanElement>(null);
	const bars = useRef<Record<string, HTMLDivElement | null>>({});
	const gainRef = useRef(gain);
	const gyroRef = useRef(gyroView);
	gainRef.current = gain;
	gyroRef.current = gyroView;

	const gyroRange = useMemo(() => {
		let m = 60;
		for (const f of replay.frames)
			for (const v of f.gyr) m = Math.max(m, Math.abs(v));
		return Math.ceil((m * 1.15) / 20) * 20;
	}, [replay]);

	const draw = useCallback(() => {
		const f = frameAt(replay, t.current);
		const g = gainRef.current;
		state.current = {
			q: amplified(f, g),
			flex: f.flex * g,
			dev: f.dev * g,
			pro: f.pro * g,
			level: f.level,
			act: f.act,
			disp: [f.disp[0] * g, f.disp[1] * g, f.disp[2] * g],
		};
		tick.current += 1;

		if (slider.current)
			slider.current.value = String(Math.round((t.current / dur) * 1000));
		if (clock.current) clock.current.textContent = `${t.current.toFixed(2)} s`;
		const gv = gyroRef.current;
		AXES.forEach((_, k) => {
			const el = readout.current[k];
			if (el) el.textContent = gv ? f.gyr[k].toFixed(0) : f.acc[k].toFixed(2);
		});
		if (levelEl.current)
			levelEl.current.textContent = `${Math.round(f.level * 100)}%`;
		for (const m of MUSCLES) {
			const b = bars.current[m.id];
			if (b) b.style.width = `${Math.round(f.act[m.id] * 100)}%`;
		}

		const c = canvas.current;
		const ctx = c?.getContext("2d");
		if (!c || !ctx) return;
		const W = c.width;
		const H = c.height;
		ctx.clearRect(0, 0, W, H);
		const range = gv ? gyroRange : 1.6;
		const y = (v: number) => H / 2 - (v / range) * (H / 2 - 12);
		ctx.strokeStyle = "#1e293b";
		ctx.fillStyle = "#64748b";
		ctx.font = "20px ui-sans-serif, system-ui";
		ctx.lineWidth = 1;
		for (const tk of gv ? [-gyroRange / 2, 0, gyroRange / 2] : [-1, 0, 1]) {
			ctx.beginPath();
			ctx.moveTo(0, y(tk));
			ctx.lineTo(W, y(tk));
			ctx.stroke();
			ctx.fillText(
				`${Math.round(tk * (gv ? 1 : 1))}${gv ? "°/s" : " g"}`,
				8,
				y(tk) - 6,
			);
		}
		const n = Math.round(WINDOW_S * replay.fs);
		const end = Math.round(t.current * replay.fs);
		const startI = end - n;
		ctx.lineWidth = 2.4;
		for (let k = 0; k < 3; k++) {
			ctx.strokeStyle = COLOURS[k];
			ctx.beginPath();
			let first = true;
			for (
				let i = Math.max(0, startI);
				i <= Math.min(end, replay.frames.length - 1);
				i++
			) {
				const fr = replay.frames[i];
				const v = gv ? fr.gyr[k] : fr.acc[k];
				const x = ((i - startI) / n) * W;
				if (first) ctx.moveTo(x, y(v));
				else ctx.lineTo(x, y(v));
				first = false;
			}
			ctx.stroke();
		}
	}, [replay, dur, gyroRange]);

	/** Jump to a time without playing; clears the wrist path. */
	const seek = useCallback(
		(s: number) => {
			t.current = Math.max(0, Math.min(dur, s));
			tick.current = -Math.abs(tick.current) - 1;
			draw();
		},
		[dur, draw],
	);

	useEffect(() => {
		seek(0);
	}, [seek]);
	// gain / gyroView are read through refs inside draw: redraw when they change
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional re-run triggers
	useEffect(() => {
		draw();
	}, [gain, gyroView, draw]);

	useEffect(() => {
		if (!playing) return;
		let raf = 0;
		let prev = performance.now();
		const step = (now: number) => {
			const dt = Math.min(0.05, (now - prev) / 1000);
			prev = now;
			t.current += dt * speed;
			if (t.current >= dur) {
				t.current = dur;
				draw();
				setPlaying(false);
				return;
			}
			draw();
			raf = requestAnimationFrame(step);
		};
		raf = requestAnimationFrame(step);
		return () => cancelAnimationFrame(raf);
	}, [playing, speed, dur, draw]);

	const play = () => {
		if (t.current >= dur - 0.01) seek(0);
		setStarted(true);
		setPlaying((p) => !p);
	};

	const title = h
		? `${h.day}, peak ${h.peak}`
		: episode
			? `${episode.kind} · ${new Date(episode.start).toLocaleTimeString()}`
			: "";
	const marks = [
		...(fromBand ? [{ t: Math.min(PRE_S, dur), label: "episode starts" }] : []),
		{ t: replay.peakT, label: "strongest" },
	];

	const pill = (on: boolean) =>
		`cursor-pointer rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${on ? "bg-teal-500 text-slate-950" : "text-slate-300 hover:bg-slate-800"}`;

	return (
		<div className="space-y-4 rounded-2xl bg-slate-950 p-5 text-slate-200">
			<div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
				<div className="relative h-[440px] overflow-hidden rounded-xl border border-slate-800">
					<ForearmModel
						state={state}
						tick={tick}
						profile={profile}
						side={side}
						view={view}
						trail={trail}
						posture={posture}
						cam={cam}
					/>
					<div className="pointer-events-none absolute left-4 top-3 text-white">
						<p className="text-2xl font-bold tabular-nums">
							<span ref={clock}>0.00 s</span>
							<span className="text-base font-medium text-slate-400">
								{" "}
								/ {dur.toFixed(1)} s
							</span>
						</p>
						<p className="text-sm text-slate-400">{title}</p>
						<p
							className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold ${fromBand ? "bg-teal-500/15 text-teal-300" : "bg-amber-500/15 text-amber-300"}`}
						>
							{fromBand
								? `Band recording · accel + gyro ${replay.fs} Hz`
								: "Modelled from summary · no raw band data"}
						</p>
						<p className="mt-1.5 max-w-[22rem] text-xs leading-snug text-slate-300">
							<span className="font-semibold capitalize text-white">
								{posture}
							</span>
							{postureSel === "auto"
								? ` · estimated: ${guess.why}`
								: " · set by hand"}
						</p>
					</div>
					<div className="pointer-events-none absolute right-4 top-3 text-right">
						<p className="text-2xl font-bold tabular-nums text-white">
							{(replay.hz || h?.hz || episode?.hz || 0).toFixed(1)}{" "}
							<span className="text-base font-medium text-slate-400">Hz</span>
						</p>
						<p className="text-sm tabular-nums text-slate-300">
							wrist {replay.p2pMm.toFixed(1)} mm peak-to-peak
						</p>
						<p className="text-sm tabular-nums text-slate-400">
							tremor now <span ref={levelEl}>0%</span>
						</p>
					</div>
					{!started && (
						<button
							type="button"
							onClick={play}
							className="absolute inset-0 m-auto flex h-20 w-20 cursor-pointer items-center justify-center rounded-full bg-teal-500/90 text-slate-950 shadow-lg shadow-teal-500/20 transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300"
							aria-label="Replay the episode"
						>
							<Play className="ml-1 h-9 w-9" />
						</button>
					)}
					<p className="pointer-events-none absolute bottom-3 left-4 right-4 text-[11px] leading-snug text-slate-500">
						Drag to rotate. Forearm orientation measured · hand, fingers and
						muscle activation estimated from the motion (no EMG)
						{gain > 1 ? ` · motion ×${gain}` : " · true scale"}
					</p>
				</div>

				<div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
					<p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
						Muscle activation (estimated)
					</p>
					<ul className="space-y-1.5">
						{MUSCLES.map((m) => (
							<li key={m.id} className="text-[11px]">
								<div className="flex justify-between text-slate-300">
									<span title={m.name}>{m.name}</span>
								</div>
								<div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-slate-800">
									<div
										ref={(el) => {
											bars.current[m.id] = el;
										}}
										className="h-full rounded-full"
										style={{ width: "0%", background: GROUP_COLOUR[m.group] }}
									/>
								</div>
							</li>
						))}
					</ul>
					<div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400">
						{Object.entries(GROUP_COLOUR).map(([g, c]) => (
							<span key={g} className="inline-flex items-center gap-1">
								<span
									className="h-2 w-2 rounded-full"
									style={{ background: c }}
								/>
								{g}
							</span>
						))}
					</div>
				</div>
			</div>

			<div className="min-w-0 rounded-xl border border-slate-800 bg-slate-900 p-4">
				<div className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-1">
					{AXES.map((a, k) => (
						<span
							key={a}
							className="text-sm font-medium tabular-nums"
							style={{ color: COLOURS[k] }}
						>
							{a}{" "}
							<b
								ref={(el) => {
									readout.current[k] = el;
								}}
								className="inline-block min-w-[3.4em] text-right text-white"
							>
								0
							</b>
						</span>
					))}
					<span className="text-sm text-slate-500">
						{gyroView ? "°/s" : "g"}
					</span>
					<label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-sm text-slate-400">
						<input
							type="checkbox"
							checked={gyroView}
							onChange={(e) => setGyroView(e.target.checked)}
							className="h-4 w-4 accent-teal-500"
						/>
						Turning speed
					</label>
				</div>
				<canvas
					ref={canvas}
					width={1000}
					height={240}
					className="h-[150px] w-full rounded-lg bg-slate-950"
					role="img"
					aria-label={
						gyroView
							? "Turning speed x y z, last 4 seconds"
							: "Acceleration x y z, last 4 seconds"
					}
				/>
			</div>

			<div>
				<div className="relative h-8">
					{marks.map((m) => (
						<span
							key={m.label}
							className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium text-slate-400"
							style={{ left: `${(m.t / dur) * 100}%` }}
						>
							{m.label}
							<span className="mx-auto mt-0.5 block h-3 w-px bg-slate-600" />
						</span>
					))}
				</div>
				<input
					ref={slider}
					type="range"
					min={0}
					max={1000}
					defaultValue={0}
					onChange={(e) => {
						setPlaying(false);
						setStarted(true);
						seek((Number(e.target.value) / 1000) * dur);
					}}
					aria-label="Replay position"
					className="w-full cursor-pointer accent-teal-500"
				/>
			</div>

			<div className="flex flex-wrap items-center gap-3">
				<button
					type="button"
					onClick={play}
					className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-teal-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300"
				>
					{playing ? (
						<Pause className="h-4 w-4" />
					) : (
						<Play className="h-4 w-4" />
					)}
					{playing ? "Pause" : "Replay episode"}
				</button>
				<button
					type="button"
					onClick={() => {
						setPlaying(false);
						seek(0);
					}}
					className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
				>
					<RotateCcw className="h-4 w-4" /> Restart
				</button>
				<fieldset
					className="inline-flex rounded-lg border border-slate-700 p-0.5 m-0 min-w-0"
					aria-label="Speed"
				>
					{SPEEDS.map((s) => (
						<button
							key={s}
							type="button"
							className={pill(speed === s)}
							onClick={() => setSpeed(s)}
						>
							{s === 1 ? "real time" : `×${s}`}
						</button>
					))}
				</fieldset>
				<fieldset
					className="inline-flex rounded-lg border border-slate-700 p-0.5 m-0 min-w-0"
					aria-label="Motion amplification"
				>
					{GAINS.map((g) => (
						<button
							key={g}
							type="button"
							className={pill(gain === g)}
							onClick={() => setGain(g)}
						>
							{g === 1 ? "true size" : `motion ×${g}`}
						</button>
					))}
				</fieldset>
				<fieldset
					className="inline-flex rounded-lg border border-slate-700 p-0.5 m-0 min-w-0"
					aria-label="Layer"
				>
					{(["skin", "muscles", "bones"] as ModelView[]).map((v) => (
						<button
							key={v}
							type="button"
							className={pill(view === v)}
							onClick={() => setView(v)}
						>
							{v}
						</button>
					))}
				</fieldset>
				<fieldset
					className="inline-flex rounded-lg border border-slate-700 p-0.5 m-0 min-w-0"
					aria-label="Camera"
				>
					{(["body", "arm"] as const).map((v) => (
						<button
							key={v}
							type="button"
							className={pill(cam === v)}
							onClick={() => setCam(v)}
						>
							{v === "body" ? "whole body" : "forearm close-up"}
						</button>
					))}
				</fieldset>
				<select
					value={postureSel}
					onChange={(e) => setPostureSel(e.target.value as Posture | "auto")}
					className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200"
					aria-label="Body posture"
				>
					<option value="auto">posture: auto ({guess.posture})</option>
					<option value="seated">seated</option>
					<option value="standing">standing</option>
					<option value="walking">walking</option>
				</select>
				<fieldset
					className="inline-flex rounded-lg border border-slate-700 p-0.5 m-0 min-w-0"
					aria-label="Arm"
				>
					{(["left", "right"] as const).map((v) => (
						<button
							key={v}
							type="button"
							className={pill(side === v)}
							onClick={() => setSide(v)}
						>
							{v} arm
						</button>
					))}
				</fieldset>
				<select
					value={profile.id}
					onChange={(e) =>
						setProfile(e.target.value === ARMELLE.id ? ARMELLE : GENERIC_ELDER)
					}
					className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200"
					aria-label="Arm model"
				>
					<option value={ARMELLE.id}>{ARMELLE.label}</option>
					<option value={GENERIC_ELDER.id}>{GENERIC_ELDER.label}</option>
				</select>
				<label className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-300">
					<input
						type="checkbox"
						checked={trail}
						onChange={(e) => setTrail(e.target.checked)}
						className="h-4 w-4 accent-teal-500"
					/>
					wrist path
				</label>
			</div>

			<ArmPhotos profile={profile} />

			{episode && (
				<ul className="space-y-1.5 border-t border-slate-800 pt-4 text-sm text-slate-300 [&_strong]:text-white">
					{tremorComments(episode, { posture, why: guess.why }).map((n) => (
						<li key={n} className="flex gap-2">
							<span
								className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500"
								aria-hidden
							/>
							<span>{renderBold(n)}</span>
						</li>
					))}
				</ul>
			)}
			{h && (
				<ul className="space-y-1.5 border-t border-slate-800 pt-4 text-sm text-slate-300 [&_strong]:text-white">
					{h.notes.map((n) => (
						<li key={n} className="flex gap-2">
							<span
								className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500"
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
