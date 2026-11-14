"use client";
// Drives the 3D arm from the real band when it streams (GET /api/live-feed tremor_hz / tremor_amp),
// or from a tremor set with an invented context (pulse, noise) so differences in intensity stay visible.
import { useEffect, useRef, useState } from "react";
import Hand3D, { type HandPose } from "@/components/Hand3D";
import type { LiveFeed } from "@/types/clinical";

interface TremorSet {
	id: string;
	label: string;
	hz: number;
	amp: number;
	bpm: number;
	noiseDb: number;
	story: string;
}

const SETS: TremorSet[] = [
	{
		id: "rest",
		label: "Calm at rest",
		hz: 4.7,
		amp: 0.03,
		bpm: 68,
		noiseDb: 40,
		story: "Quiet room, seated. Pulse low, almost no tremor.",
	},
	{
		id: "dose",
		label: "After a dose",
		hz: 5.0,
		amp: 0.08,
		bpm: 74,
		noiseDb: 46,
		story: "45 minutes after the dose. Mild tremor, fading.",
	},
	{
		id: "wear",
		label: "Wearing-off, 17:00",
		hz: 5.5,
		amp: 0.22,
		bpm: 88,
		noiseDb: 52,
		story: "Late afternoon, dose due. Strong tremor, pulse rising.",
	},
	{
		id: "crowd",
		label: "Crowd stress",
		hz: 5.9,
		amp: 0.32,
		bpm: 112,
		noiseDb: 82,
		story:
			"Busy shop. Pulse very high, loud surroundings: a stressful event with many people.",
	},
];

const wave = (hz: number, t: number) =>
	Math.sin(2 * Math.PI * hz * t) +
	0.18 * Math.sin(4 * Math.PI * hz * t + 0.7) +
	0.06 * Math.sin(7.3 * t);

export default function MyBand() {
	const [sel, setSel] = useState("wear");
	const [live, setLive] = useState<{ hz: number; amp: number } | null>(null);
	const [useLive, setUseLive] = useState(true);
	const pose = useRef<HandPose>({
		tilt: 0,
		roll: 0,
		fingers: 0,
		accel: [0, 0, 0],
		level: 0,
	});
	const cur = useRef({ hz: 5, amp: 0.1 });
	const set = SETS.find((s) => s.id === sel) ?? SETS[0];
	const driving = useLive && live ? live : set;
	cur.current = driving;

	useEffect(() => {
		let on = true;
		const poll = async () => {
			try {
				const f = (await (
					await fetch("/api/live-feed?patientId=henri-m", { cache: "no-store" })
				).json()) as LiveFeed;
				const last = (k: string) => f[k]?.[f[k].length - 1];
				const hz = last("tremor_hz");
				const amp = last("tremor_amp");
				if (on)
					setLive(
						hz && amp && Date.now() - hz.t < 15000
							? { hz: hz.v, amp: amp.v }
							: null,
					);
			} catch {
				if (on) setLive(null);
			}
		};
		poll();
		const id = setInterval(poll, 1500);
		return () => {
			on = false;
			clearInterval(id);
		};
	}, []);

	useEffect(() => {
		let raf = 0;
		let t = 0;
		let prev = performance.now();
		let smooth = 0.1;
		const tick = (now: number) => {
			const dt = Math.min(0.05, (now - prev) / 1000);
			prev = now;
			t += dt;
			const { hz, amp } = cur.current;
			smooth += (amp - smooth) * Math.min(1, dt * 3);
			const w = wave(hz, t);
			const lvl = smooth / 0.3;
			pose.current = {
				tilt: (smooth / 0.3) * 9 * 1.5 * w,
				roll: (smooth / 0.3) * 9 * 0.6 * wave(hz, t + 0.04),
				fingers: lvl * wave(hz, t + 0.06),
				accel: [
					smooth * w,
					0.55 * smooth * wave(hz, t + 0.03),
					0.35 * smooth * wave(hz, t + 0.07),
				],
				level: lvl,
				flexor: Math.min(1, lvl * Math.max(0, w)),
				extensor: Math.min(1, lvl * Math.max(0, -w)),
			};
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, []);

	const intensity = Math.min(10, driving.amp * 20);
	const fromLive = useLive && live;

	return (
		<div className="space-y-4 rounded-2xl bg-slate-950 p-5 text-slate-200">
			<div className="flex flex-wrap items-center gap-2">
				{SETS.map((s) => (
					<button
						key={s.id}
						type="button"
						aria-pressed={sel === s.id && !fromLive}
						onClick={() => {
							setSel(s.id);
							setUseLive(false);
						}}
						className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
							sel === s.id && !fromLive
								? "border-blue-500 bg-blue-500 text-white"
								: "border-slate-700 text-slate-300 hover:bg-slate-800"
						}`}
					>
						{s.label}
					</button>
				))}
				<button
					type="button"
					aria-pressed={!!fromLive}
					onClick={() => setUseLive(true)}
					disabled={!live}
					className={`ml-auto cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
						fromLive
							? "border-green-500 bg-green-600 text-white"
							: "border-slate-700 text-slate-300 hover:bg-slate-800"
					}`}
				>
					{live ? "My band, live" : "My band (not streaming)"}
				</button>
			</div>
			<div className="relative h-[420px] overflow-hidden rounded-xl border border-slate-800">
				<Hand3D pose={pose} active />
				<div className="pointer-events-none absolute right-4 top-3 text-right">
					<p className="text-3xl font-bold tabular-nums text-white">
						{driving.hz.toFixed(1)}{" "}
						<span className="text-base font-medium text-slate-400">Hz</span>
					</p>
					<p
						className={`text-sm font-semibold tabular-nums ${intensity > 4 ? "text-red-400" : "text-slate-300"}`}
					>
						intensity {intensity.toFixed(1)}/10
					</p>
				</div>
				<p className="pointer-events-none absolute left-4 top-3 text-sm text-slate-400">
					{fromLive ? "Real band motion" : `Tremor set: ${set.label}`}
				</p>
			</div>
			{!fromLive && (
				<div className="grid gap-3 sm:grid-cols-3">
					<Stat label="Pulse" value={`${set.bpm} bpm`} hot={set.bpm > 100} />
					<Stat
						label="Ambient noise"
						value={`${set.noiseDb} dB`}
						hot={set.noiseDb > 70}
					/>
					<Stat
						label="Tremor amplitude"
						value={`${set.amp.toFixed(2)} g`}
						hot={set.amp > 0.2}
					/>
				</div>
			)}
			<p className="text-sm text-slate-400">
				{fromLive
					? "Pulse and noise are not read from the band here. Switch to a set to see an invented context."
					: `${set.story} (simulated context)`}
			</p>
		</div>
	);
}

function Stat({
	label,
	value,
	hot,
}: {
	label: string;
	value: string;
	hot: boolean;
}) {
	return (
		<div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
			<p className="text-xs text-slate-500">{label}</p>
			<p
				className={`text-xl font-bold tabular-nums ${hot ? "text-red-400" : "text-white"}`}
			>
				{value}
			</p>
		</div>
	);
}
