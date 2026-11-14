"use client";
// Replays a tremor episode the way the Vexo kit shows the band: x/y/z acceleration (g) and turning speed (°/s),
// scrolling over ~4 s, next to the hand that produced it.
import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Hand3D, { type HandPose } from "@/components/Hand3D";
import type { TremorHighlight } from "@/data/modelization";
import { renderBold } from "@/lib/renderBold";

const REPLAY_MS = 20000; // whole window replayed in 20 s
const KEEP = 400; // samples on screen: 4 s at 100 Hz, like the kit's graph
const STEP = 0.01;
const COLOURS = ["#5aa2ff", "#ff9a4d", "#4cc47f"]; // x, y, z: Vexo dashboard dark palette
const AXES = ["x", "y", "z"] as const;
const VIEWS = {
	accel: { range: 1.5, ticks: [-1, 0, 1], unit: "g", digits: 2 },
	gyro: { range: 300, ticks: [-200, 0, 200], unit: "°/s", digits: 0 },
} as const;

type Sample = number[]; // ax ay az gx gy gz

const mins = (t: string) => {
	const [h, m] = t.split(":").map(Number);
	return h * 60 + m;
};
const fmt = (m: number) =>
	`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(Math.floor(m % 60)).padStart(2, "0")}`;

/** Amplitude (g) at clock minute m: slow build-up before the peak, faster fade after. */
function ampAt(h: TremorHighlight, m: number) {
	const d = m - mins(h.peak);
	const s = d < 0 ? 4.5 : 6.5;
	return 0.02 + h.ampG * Math.exp(-((d / s) ** 2));
}

/** One tremor cycle shape: main component, harmonic, slight irregularity. */
function shape(hz: number, t: number) {
	const w = 2 * Math.PI * hz;
	return (
		Math.sin(w * t) +
		0.18 * Math.sin(2 * w * t + 0.7) +
		0.06 * Math.sin(7.3 * t)
	);
}

/** Wrist tilt in degrees for a given amplitude. */
const tilt = (h: TremorHighlight, amp: number, t: number) =>
	(amp / h.ampG) * 9 * shape(h.hz, t);

function sample(h: TremorHighlight, amp: number, t: number): Sample {
	const e = 0.004;
	const rate = (tilt(h, amp, t + e) - tilt(h, amp, t - e)) / (2 * e); // °/s
	return [
		amp * shape(h.hz, t),
		0.55 * amp * shape(h.hz, t + 0.03),
		1 + 0.35 * amp * shape(h.hz, t + 0.07), // gravity on z
		rate,
		0.5 * rate,
		0.3 * rate,
	];
}

export default function TremorReplay({ h }: { h: TremorHighlight }) {
	const start = mins(h.start);
	const span = mins(h.end) - start;
	const [prog, setProg] = useState(0);
	const [playing, setPlaying] = useState(false);
	const [slow, setSlow] = useState(false);
	const [gyro, setGyro] = useState(false);
	const [reading, setReading] = useState<Sample>([0, 0, 1, 0, 0, 0]);
	const pose = useRef<HandPose>({
		tilt: 0,
		roll: 0,
		fingers: 0,
		accel: [0, 0, 0],
		level: 0,
	});
	const canvas = useRef<HTMLCanvasElement>(null);
	const buf = useRef<Sample[]>([]);
	const clock = useRef(0);
	const last = useRef(0);
	const progRef = useRef(0);
	const playRef = useRef(false);
	const slowRef = useRef(false);
	const gyroRef = useRef(false);
	progRef.current = prog;
	playRef.current = playing;
	slowRef.current = slow;
	gyroRef.current = gyro;

	const minute = start + prog * span;
	const amp = ampAt(h, minute);
	const intensity = Math.min(10, amp * 20);

	useEffect(() => {
		let raf = 0;
		let acc = 0;
		const draw = () => {
			const c = canvas.current;
			const ctx = c?.getContext("2d");
			if (!c || !ctx) return;
			const view = gyroRef.current ? VIEWS.gyro : VIEWS.accel;
			const { width: W, height: H } = c;
			ctx.clearRect(0, 0, W, H);
			ctx.font = "22px system-ui, sans-serif";
			ctx.textBaseline = "middle";
			for (const t of view.ticks) {
				const y = H * (0.5 - t / (2 * view.range));
				ctx.strokeStyle = t === 0 ? "#334155" : "#1b2636";
				ctx.lineWidth = 2;
				ctx.beginPath();
				ctx.moveTo(0, y);
				ctx.lineTo(W, y);
				ctx.stroke();
				ctx.fillStyle = "#64748b";
				ctx.fillText(`${t} ${t === 0 ? view.unit : ""}`, 8, y - 14);
			}
			const off = gyroRef.current ? 3 : 0;
			AXES.forEach((_, k) => {
				ctx.beginPath();
				ctx.strokeStyle = COLOURS[k];
				ctx.lineWidth = 3;
				buf.current.forEach((m, i) => {
					const x = (i * W) / KEEP;
					const y = H * (0.5 - m[off + k] / (2 * view.range));
					if (i === 0) ctx.moveTo(x, y);
					else ctx.lineTo(x, y);
				});
				ctx.stroke();
			});
		};
		const tick = (now: number) => {
			const dt = Math.min(0.05, (now - last.current) / 1000);
			last.current = now;
			const speed = slowRef.current ? 0.12 : 1;
			acc += dt * speed;
			let pushed = false;
			while (acc >= STEP) {
				acc -= STEP;
				clock.current += STEP;
				const a = ampAt(h, start + progRef.current * span);
				buf.current.push(sample(h, a, clock.current));
				if (buf.current.length > KEEP) buf.current.shift();
				pushed = true;
			}
			const a = ampAt(h, start + progRef.current * span);
			const t = clock.current;
			const last2 = buf.current[buf.current.length - 1];
			pose.current = {
				tilt: tilt(h, a, t) * 1.5,
				roll: tilt(h, a, t + 0.04) * 0.6,
				fingers: (a / h.ampG) * shape(h.hz, t + 0.06),
				accel: last2 ? [last2[0], last2[1], last2[2] - 1] : [0, 0, 0],
				level: a / 0.3,
				// tremor = flexors and extensors firing in alternation
				flexor: Math.min(1, (a / 0.3) * Math.max(0, shape(h.hz, t))),
				extensor: Math.min(1, (a / 0.3) * Math.max(0, -shape(h.hz, t))),
			};
			if (pushed) setReading(buf.current[buf.current.length - 1]);
			if (playRef.current) {
				const p = Math.min(1, progRef.current + (dt * 1000) / REPLAY_MS);
				progRef.current = p;
				setProg(p);
				if (p >= 1) setPlaying(false);
			}
			draw();
			raf = requestAnimationFrame(tick);
		};
		last.current = performance.now();
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [h, span, start]);

	const view = gyro ? VIEWS.gyro : VIEWS.accel;
	const peakAt = ((mins(h.peak) - start) / span) * 100;

	return (
		<div className="space-y-5 rounded-2xl bg-slate-950 p-5 text-slate-200">
			<div className="relative h-[380px] overflow-hidden rounded-xl border border-slate-800">
				<Hand3D pose={pose} active={playing} />
				<div className="pointer-events-none absolute left-4 top-3 text-white">
					<p className="text-3xl font-bold tabular-nums">{fmt(minute)}</p>
					<p className="text-sm text-slate-400">{h.day}, right wrist</p>
				</div>
				<div className="pointer-events-none absolute right-4 top-3 text-right">
					<p className="text-3xl font-bold tabular-nums text-white">
						{h.hz.toFixed(1)}{" "}
						<span className="text-base font-medium text-slate-400">Hz</span>
					</p>
					<p
						className={`text-sm font-semibold tabular-nums ${intensity > 4 ? "text-red-400" : "text-slate-300"}`}
					>
						intensity {intensity.toFixed(1)}/10
					</p>
				</div>
				<p className="pointer-events-none absolute bottom-3 left-4 text-xs text-slate-500">
					Drag to rotate · muscles light up as they fire ·{" "}
					{slow ? "slow motion" : "real time"}
				</p>
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
							<b className="inline-block min-w-[3.4em] text-right text-white">
								{reading[(gyro ? 3 : 0) + k].toFixed(view.digits)}
							</b>
						</span>
					))}
					<span className="text-sm text-slate-500">{view.unit}</span>
					<label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-sm text-slate-400">
						<input
							type="checkbox"
							checked={gyro}
							onChange={(e) => setGyro(e.target.checked)}
							className="h-4 w-4 accent-blue-500"
						/>
						Turning speed
					</label>
				</div>
				<canvas
					ref={canvas}
					width={1000}
					height={260}
					className="h-[170px] w-full rounded-lg bg-slate-950"
					role="img"
					aria-label={
						gyro
							? "Live turning speed graph, x y and z"
							: "Live acceleration graph, x y and z"
					}
				/>
			</div>

			<div>
				<div className="relative h-9">
					<div
						className="absolute inset-x-0 top-5 h-2 rounded-full"
						style={{
							background: `linear-gradient(90deg,#1e293b,#b91c1c ${peakAt.toFixed(0)}%,#1e293b)`,
						}}
					/>
					{h.marks.map((m) => (
						<span
							key={m.time}
							className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium text-slate-400"
							style={{ left: `${((mins(m.time) - start) / span) * 100}%` }}
						>
							{m.label}
							<span className="mx-auto mt-0.5 block h-3 w-px bg-slate-600" />
						</span>
					))}
				</div>
				<input
					type="range"
					min={0}
					max={1000}
					value={Math.round(prog * 1000)}
					onChange={(e) => {
						setPlaying(false);
						setProg(Number(e.target.value) / 1000);
					}}
					aria-label="Replay position"
					className="w-full cursor-pointer accent-blue-600"
				/>
				<div className="flex justify-between text-xs tabular-nums text-slate-500">
					<span>{h.start}</span>
					<span>{h.end}</span>
				</div>
			</div>

			<div className="flex flex-wrap items-center gap-3">
				<button
					type="button"
					onClick={() => {
						if (prog >= 1) setProg(0);
						setPlaying((p) => !p);
					}}
					className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
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
						setProg(0);
					}}
					className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-700 bg-transparent px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
				>
					<RotateCcw className="h-4 w-4" /> Restart
				</button>
				<label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-sm text-slate-300">
					<input
						type="checkbox"
						checked={slow}
						onChange={(e) => setSlow(e.target.checked)}
						className="h-4 w-4 accent-blue-600"
					/>
					Slow motion
				</label>
			</div>

			<ul className="space-y-1.5 border-t border-slate-800 pt-4 text-sm text-slate-300 [&_strong]:text-white">
				{h.notes.map((n) => (
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
