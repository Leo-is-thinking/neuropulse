// Turns a raw wrist IMU clip (band accel + gyro) into replay frames for the 3D forearm.
//
// What is measured and what is estimated:
//  - forearm orientation: MEASURED, Madgwick 6-axis filter (accel + gyro). Heading drifts slowly (no magnetometer),
//    so the replay starts facing a fixed direction.
//  - wrist displacement: MEASURED but band-limited. Gravity-free acceleration is integrated twice with a centred
//    0.5 s high-pass, so only the tremor-scale motion (millimetres, >= 2 Hz) is kept, never an absolute path.
//  - hand flexion / deviation and finger motion: ESTIMATED from the forearm oscillation (the band sits above the wrist).
//  - muscle activation: ESTIMATED from the direction and phase of the motion. The band has no EMG.
//
// Band frame (kit convention, see bridge/algos.py pitch/roll): x along the forearm toward the hand,
// y across the wrist, z out of the back of the wrist. Gravity at rest, band flat and face up: (0, 0, +1) g.
import type { ImuRecording } from "@/types/clinical";

export type Vec3 = [number, number, number];
/** w x y z, rotates band-frame vectors into the world frame (z up). */
export type Quat = [number, number, number, number];

/**
 * Sign conventions for a band worn on the back of the wrist, x toward the hand.
 * Flexion = +gy (hand tips toward the palm). Radial deviation and pronation signs depend on how the band
 * sits; flip them here if a real recording shows them inverted.
 */
const SIGN = { flex: 1, radial: 1, pron: 1 };

export const MUSCLES = [
	{ id: "FCR", name: "Flexor carpi radialis", group: "flexor" },
	{ id: "PL", name: "Palmaris longus", group: "flexor" },
	{ id: "FCU", name: "Flexor carpi ulnaris", group: "flexor" },
	{ id: "FDS", name: "Flexor digitorum superficialis", group: "flexor" },
	{ id: "ECRL", name: "Extensor carpi radialis longus", group: "extensor" },
	{ id: "ECRB", name: "Extensor carpi radialis brevis", group: "extensor" },
	{ id: "ED", name: "Extensor digitorum", group: "extensor" },
	{ id: "ECU", name: "Extensor carpi ulnaris", group: "extensor" },
	{ id: "PT", name: "Pronator teres", group: "pronator" },
	{ id: "PQ", name: "Pronator quadratus", group: "pronator" },
	{ id: "SUP", name: "Supinator", group: "supinator" },
	{ id: "APL", name: "Abductor pollicis longus", group: "supinator" },
	{ id: "BR", name: "Brachioradialis", group: "postural" },
] as const;
export type MuscleId = (typeof MUSCLES)[number]["id"];
export type MuscleActivation = Record<MuscleId, number>;

/** How each muscle answers the three wrist motions (positive drive only) plus its resting tone. */
const DRIVE: Record<
	MuscleId,
	{
		flex?: number;
		ext?: number;
		rad?: number;
		uln?: number;
		pro?: number;
		sup?: number;
		tone: number;
	}
> = {
	FCR: { flex: 0.75, rad: 0.45, tone: 0.06 },
	PL: { flex: 0.6, tone: 0.04 },
	FCU: { flex: 0.75, uln: 0.5, tone: 0.06 },
	FDS: { flex: 0.65, tone: 0.07 },
	ECRL: { ext: 0.65, rad: 0.55, tone: 0.1 },
	ECRB: { ext: 0.85, tone: 0.1 },
	ED: { ext: 0.75, tone: 0.07 },
	ECU: { ext: 0.65, uln: 0.55, tone: 0.07 },
	PT: { pro: 0.95, tone: 0.05 },
	PQ: { pro: 0.8, tone: 0.05 },
	SUP: { sup: 0.95, tone: 0.05 },
	APL: { sup: 0.4, rad: 0.4, tone: 0.04 },
	BR: { pro: 0.35, sup: 0.35, tone: 0.14 },
};

export interface ReplayFrame {
	/** Seconds from the clip start. */
	t: number;
	/** Measured forearm orientation (band to world, z up), heading set to 0 at the start. */
	q: Quat;
	/** Same orientation low-passed (1 s): the posture without the tremor. Used to amplify the tremor on screen. */
	qSlow: Quat;
	/** Wrist displacement around its mean, metres, world frame (tremor band only). */
	disp: Vec3;
	/** Raw readings: accel g, gyro °/s. */
	acc: Vec3;
	gyr: Vec3;
	/** Tremor oscillation angles, degrees: wrist flexion(+)/extension(-), radial(+)/ulnar(-), pronation(+)/supination(-). */
	flex: number;
	dev: number;
	pro: number;
	/** 0..1 tremor strength around this instant. */
	level: number;
	/** 0..1 estimated activation per muscle. */
	act: MuscleActivation;
}

export interface Replay {
	fs: number;
	duration: number;
	frames: ReplayFrame[];
	/** Time of the strongest tremor, s. */
	peakT: number;
	/** Dominant tremor frequency measured on the clip, Hz (0 if none). */
	hz: number;
	/** Peak-to-peak wrist displacement during the strongest second, mm. */
	p2pMm: number;
}

// ---------- small maths ----------
const D2R = Math.PI / 180;
const qmul = (a: Quat, b: Quat): Quat => [
	a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
	a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
	a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
	a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
];
const qconj = (q: Quat): Quat => [q[0], -q[1], -q[2], -q[3]];
const qnorm = (q: Quat): Quat => {
	const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
	return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
};
export function qrot(q: Quat, v: Vec3): Vec3 {
	const r = qmul(qmul(q, [0, v[0], v[1], v[2]]), qconj(q));
	return [r[1], r[2], r[3]];
}
/** Shortest rotation taking unit vector a onto unit vector b. */
function qFromTo(a: Vec3, b: Vec3): Quat {
	const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
	if (d < -0.9999) return [0, 1, 0, 0];
	const c: Vec3 = [
		a[1] * b[2] - a[2] * b[1],
		a[2] * b[0] - a[0] * b[2],
		a[0] * b[1] - a[1] * b[0],
	];
	return qnorm([1 + d, c[0], c[1], c[2]]);
}
const qAxis = (axis: Vec3, ang: number): Quat => {
	const s = Math.sin(ang / 2);
	return [Math.cos(ang / 2), axis[0] * s, axis[1] * s, axis[2] * s];
};
const unit = (v: Vec3): Vec3 => {
	const n = Math.hypot(v[0], v[1], v[2]) || 1;
	return [v[0] / n, v[1] / n, v[2] / n];
};

/** Centred moving average, window w samples (edges use the samples available). */
function smooth(x: number[], w: number): number[] {
	const n = x.length;
	const h = Math.max(1, Math.floor(w / 2));
	const pre = new Float64Array(n + 1);
	for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + x[i];
	const out = new Array<number>(n);
	for (let i = 0; i < n; i++) {
		const a = Math.max(0, i - h);
		const b = Math.min(n, i + h + 1);
		out[i] = (pre[b] - pre[a]) / (b - a);
	}
	return out;
}
const highpass = (x: number[], w: number) => {
	const s = smooth(x, w);
	return x.map((v, i) => v - s[i]);
};
/** Integrate then remove the slow part again, so nothing drifts. */
function integrateHp(x: number[], dt: number, w: number): number[] {
	const out = new Array<number>(x.length);
	let acc = 0;
	for (let i = 0; i < x.length; i++) {
		acc += x[i] * dt;
		out[i] = acc;
	}
	return highpass(out, w);
}

/** One Madgwick IMU step (gyro rad/s, accel any unit). Returns the new orientation. */
function madgwick(q: Quat, g: Vec3, a: Vec3, beta: number, dt: number): Quat {
	let [q0, q1, q2, q3] = q;
	let qd0 = 0.5 * (-q1 * g[0] - q2 * g[1] - q3 * g[2]);
	let qd1 = 0.5 * (q0 * g[0] + q2 * g[2] - q3 * g[1]);
	let qd2 = 0.5 * (q0 * g[1] - q1 * g[2] + q3 * g[0]);
	let qd3 = 0.5 * (q0 * g[2] + q1 * g[1] - q2 * g[0]);
	const an = Math.hypot(a[0], a[1], a[2]);
	// trust the accelerometer only when it reads close to 1 g (not during a jolt)
	if (an > 0.5 && an < 1.5) {
		const ax = a[0] / an;
		const ay = a[1] / an;
		const az = a[2] / an;
		const f1 = 2 * (q1 * q3 - q0 * q2) - ax;
		const f2 = 2 * (q0 * q1 + q2 * q3) - ay;
		const f3 = 2 * (0.5 - q1 * q1 - q2 * q2) - az;
		let s0 = -2 * q2 * f1 + 2 * q1 * f2;
		let s1 = 2 * q3 * f1 + 2 * q0 * f2 - 4 * q1 * f3;
		let s2 = -2 * q0 * f1 + 2 * q3 * f2 - 4 * q2 * f3;
		let s3 = 2 * q1 * f1 + 2 * q2 * f2;
		const sn = Math.hypot(s0, s1, s2, s3) || 1;
		s0 /= sn;
		s1 /= sn;
		s2 /= sn;
		s3 /= sn;
		qd0 -= beta * s0;
		qd1 -= beta * s1;
		qd2 -= beta * s2;
		qd3 -= beta * s3;
	}
	q0 += qd0 * dt;
	q1 += qd1 * dt;
	q2 += qd2 * dt;
	q3 += qd3 * dt;
	return qnorm([q0, q1, q2, q3]);
}

/** Dominant frequency 3-9 Hz of a signal (simple DFT scan), or 0 if flat. */
function dominantHz(x: number[], fs: number): number {
	if (x.length < fs) return 0;
	let best = 0;
	let bestP = 0;
	let total = 0;
	for (let f = 3; f <= 9.001; f += 0.1) {
		let re = 0;
		let im = 0;
		for (let i = 0; i < x.length; i++) {
			const w = 2 * Math.PI * f * (i / fs);
			re += x[i] * Math.cos(w);
			im += x[i] * Math.sin(w);
		}
		const p = re * re + im * im;
		total += p;
		if (p > bestP) {
			bestP = p;
			best = f;
		}
	}
	return total > 0 ? Math.round(best * 10) / 10 : 0;
}

// ---------- reconstruction ----------
export function reconstruct(rec: ImuRecording): Replay {
	const fs = rec.fs;
	const dt = 1 / fs;
	const n = rec.s.length;
	const acc = rec.s.map((r) => [r[0], r[1], r[2]] as Vec3);
	const gyr = rec.s.map((r) => [r[3] ?? 0, r[4] ?? 0, r[5] ?? 0] as Vec3);

	// start pose from the mean gravity of the first 0.5 s
	const k0 = Math.min(n, Math.max(1, Math.round(fs / 2)));
	const g0: Vec3 = [0, 0, 0];
	for (let i = 0; i < k0; i++)
		for (let j = 0; j < 3; j++) g0[j] += acc[i][j] / k0;
	let q = qFromTo(unit(g0), [0, 0, 1]);
	const qs: Quat[] = [];
	for (let i = 0; i < n; i++) {
		q = madgwick(
			q,
			[gyr[i][0] * D2R, gyr[i][1] * D2R, gyr[i][2] * D2R],
			acc[i],
			0.04,
			dt,
		);
		qs.push(q);
	}
	// heading zero: forearm points along world +x at the start
	const fwd = qrot(qs[0], [1, 0, 0]);
	const yaw = Math.atan2(fwd[1], fwd[0]);
	const qYaw = qAxis([0, 0, 1], -yaw);
	for (let i = 0; i < n; i++) qs[i] = qmul(qYaw, qs[i]);

	// slow posture: 1 s moving average of quaternion components (hemisphere-aligned), renormalised
	const comp = [0, 1, 2, 3].map((c) =>
		qs.map((qq) =>
			qq[0] * qs[0][0] +
				qq[1] * qs[0][1] +
				qq[2] * qs[0][2] +
				qq[3] * qs[0][3] <
			0
				? -qq[c]
				: qq[c],
		),
	);
	const slowC = comp.map((c) => smooth(c, fs));
	const qSlow = qs.map((_, i) =>
		qnorm([slowC[0][i], slowC[1][i], slowC[2][i], slowC[3][i]]),
	);

	// gravity-free acceleration in the world frame, m/s²
	const lin = [0, 1, 2].map(() => new Array<number>(n));
	for (let i = 0; i < n; i++) {
		const w = qrot(qs[i], acc[i]);
		lin[0][i] = w[0] * 9.81;
		lin[1][i] = w[1] * 9.81;
		lin[2][i] = (w[2] - 1) * 9.81;
	}
	const W = Math.max(3, Math.round(fs * 0.5));
	const disp = lin.map((a) =>
		integrateHp(integrateHp(highpass(a, W), dt, W), dt, W),
	);

	// tremor oscillation angles from high-passed body rates
	const hpRate = [0, 1, 2].map((j) =>
		highpass(
			gyr.map((g) => g[j]),
			W,
		),
	);
	const ang = hpRate.map((r) => integrateHp(r, dt, W));
	const pro = ang[0].map((v) => v * SIGN.pron);
	const flex = ang[1].map((v) => v * SIGN.flex);
	const dev = ang[2].map((v) => v * SIGN.radial);

	// tremor level: 0.4 s RMS of the high-passed rate magnitude
	const mag = hpRate[0].map(
		(_, i) => hpRate[0][i] ** 2 + hpRate[1][i] ** 2 + hpRate[2][i] ** 2,
	);
	const rms = smooth(mag, Math.round(fs * 0.4)).map(Math.sqrt);
	const rmsMax = Math.max(40, ...rms);
	let peakI = 0;
	for (let i = 0; i < n; i++) if (rms[i] > rms[peakI]) peakI = i;

	// muscle drive: rate a little ahead of now (the burst precedes the motion it causes), normalised per axis
	const lead = Math.max(1, Math.round(fs * 0.02));
	const norm = hpRate.map((r) => {
		const s = r.map(Math.abs).sort((a, b) => a - b);
		return Math.max(25, s[Math.floor(s.length * 0.95)] ?? 25);
	});
	const frames: ReplayFrame[] = new Array(n);
	for (let i = 0; i < n; i++) {
		const j = Math.min(n - 1, i + lead);
		const wPro = (hpRate[0][j] * SIGN.pron) / norm[0];
		const wFlex = (hpRate[1][j] * SIGN.flex) / norm[1];
		const wDev = (hpRate[2][j] * SIGN.radial) / norm[2];
		const m = {
			flex: Math.max(0, wFlex),
			ext: Math.max(0, -wFlex),
			rad: Math.max(0, wDev),
			uln: Math.max(0, -wDev),
			pro: Math.max(0, wPro),
			sup: Math.max(0, -wPro),
		};
		// holding the forearm up against gravity adds tone to the brachioradialis and wrist extensors
		const up = qrot(qSlow[i], [1, 0, 0])[2];
		const hold = Math.max(0, up) * 0.3;
		const act = {} as MuscleActivation;
		for (const mu of MUSCLES) {
			const d = DRIVE[mu.id];
			let v =
				d.tone +
				(d.flex ?? 0) * m.flex +
				(d.ext ?? 0) * m.ext +
				(d.rad ?? 0) * m.rad +
				(d.uln ?? 0) * m.uln +
				(d.pro ?? 0) * m.pro +
				(d.sup ?? 0) * m.sup;
			if (mu.id === "BR" || mu.id === "ECRL" || mu.id === "ECRB") v += hold;
			act[mu.id] = Math.min(
				1,
				v * (0.35 + 0.65 * Math.min(1, rms[i] / rmsMax + 0.25)),
			);
		}
		frames[i] = {
			t: i * dt,
			q: qs[i],
			qSlow: qSlow[i],
			disp: [disp[0][i], disp[1][i], disp[2][i]],
			acc: acc[i],
			gyr: gyr[i],
			flex: flex[i],
			dev: dev[i],
			pro: pro[i],
			level: Math.min(1, rms[i] / rmsMax),
			act,
		};
	}

	// peak-to-peak displacement over the strongest second
	const a = Math.max(0, peakI - Math.round(fs / 2));
	const b = Math.min(n, a + fs);
	let p2p = 0;
	for (let j = 0; j < 3; j++) {
		const seg = disp[j].slice(a, b);
		if (seg.length) p2p = Math.max(p2p, Math.max(...seg) - Math.min(...seg));
	}
	const main = [0, 1, 2].reduce(
		(best, j) => (norm[j] > norm[best] ? j : best),
		0,
	);
	return {
		fs,
		duration: n * dt,
		frames,
		peakT: peakI * dt,
		hz: dominantHz(hpRate[main].slice(a, Math.min(n, a + 3 * fs)), fs),
		p2pMm: Math.round(p2p * 1000 * 10) / 10,
	};
}

/** Frame at time t (s), nearest sample. */
export const frameAt = (r: Replay, t: number) =>
	r.frames[Math.max(0, Math.min(r.frames.length - 1, Math.round(t * r.fs)))];

// ---------- synthetic clip (demo patients without raw band data) ----------
function rng(seed: number) {
	let s = seed >>> 0 || 1;
	return () => {
		s ^= s << 13;
		s ^= s >>> 17;
		s ^= s << 5;
		return ((s >>> 0) % 100000) / 100000;
	};
}
const gauss = (r: () => number) =>
	Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r());

/**
 * Builds a physically consistent raw IMU clip for a Parkinsonian rest tremor: pronation-supination dominant,
 * wrist flexion second, slight deviation, frequency wandering ±0.2 Hz, amplitude building to a peak then fading.
 * The accelerometer sees gravity through the simulated orientation, so the replay pipeline treats it like real data.
 */
export function synthClip(o: {
	hz: number;
	/** Peak wrist acceleration, g. */
	amp: number;
	seconds?: number;
	seed?: number;
	/** Forearm pitch (deg, + = hand up) and roll (deg) of the resting posture. */
	pitch?: number;
	roll?: number;
	fs?: number;
}): ImuRecording {
	const fs = o.fs ?? 50;
	const T = o.seconds ?? 12;
	const n = Math.round(T * fs);
	const dt = 1 / fs;
	const r = rng(o.seed ?? 7);
	// angle amplitude: band ~4 cm from the rotation axes, a = θ·(2πf)²·r  =>  θ(rad) ≈ a(g)·9.81 / ((2πf)²·0.04)
	const theta =
		Math.min(0.5, (o.amp * 9.81) / ((2 * Math.PI * o.hz) ** 2 * 0.04)) / D2R;
	const amps = { pro: theta, flex: 0.6 * theta, dev: 0.2 * theta };
	let q = qmul(
		qAxis([0, 1, 0], -(o.pitch ?? -12) * D2R),
		qAxis([1, 0, 0], (o.roll ?? 35) * D2R),
	);
	let phase = 0;
	let drift: Vec3 = [0, 0, 0];
	const prev = { pro: 0, flex: 0, dev: 0 };
	const prevRate: Vec3 = [0, 0, 0];
	const rows: number[][] = [];
	const tPeak = T * 0.55;
	for (let i = 0; i < n; i++) {
		const t = i * dt;
		const env =
			0.12 +
			0.88 *
				Math.exp(-(((t - tPeak) / (t < tPeak ? T * 0.28 : T * 0.36)) ** 2));
		phase +=
			2 * Math.PI * (o.hz + 0.18 * Math.sin(0.4 * t) + 0.05 * gauss(r)) * dt;
		const wave = (lag: number) =>
			Math.sin(phase - lag) + 0.15 * Math.sin(2 * (phase - lag) + 0.7);
		const cur = {
			pro: amps.pro * env * wave(0),
			flex: amps.flex * env * wave(0.9),
			dev: amps.dev * env * wave(1.7),
		};
		// slow voluntary sway, °/s
		drift = drift.map((d) => d * 0.995 + 0.08 * gauss(r)) as Vec3;
		const rate: Vec3 = [
			(cur.pro - prev.pro) / dt / SIGN.pron + drift[0],
			(cur.flex - prev.flex) / dt / SIGN.flex + drift[1],
			(cur.dev - prev.dev) / dt / SIGN.radial + drift[2],
		];
		Object.assign(prev, cur);
		const w = rate.map((v) => v * D2R) as Vec3;
		const wn = Math.hypot(w[0], w[1], w[2]);
		if (wn > 1e-9)
			q = qnorm(qmul(q, qAxis([w[0] / wn, w[1] / wn, w[2] / wn], wn * dt)));
		// gravity seen by the band + tangential acceleration of the band (~3-6 cm from the rotation axes)
		const g = qrot(qconj(q), [0, 0, 1]);
		const alpha = rate.map((v, j) => ((v - prevRate[j]) / dt) * D2R) as Vec3;
		prevRate[0] = rate[0];
		prevRate[1] = rate[1];
		prevRate[2] = rate[2];
		const lin: Vec3 = [
			0,
			(alpha[2] * 0.06 - alpha[0] * 0.02) / 9.81,
			(-alpha[1] * 0.06 + alpha[0] * 0.03) / 9.81,
		];
		rows.push([
			+(g[0] + lin[0] + 0.004 * gauss(r)).toFixed(4),
			+(g[1] + lin[1] + 0.004 * gauss(r)).toFixed(4),
			+(g[2] + lin[2] + 0.004 * gauss(r)).toFixed(4),
			+(rate[0] + 0.6 * gauss(r)).toFixed(2),
			+(rate[1] + 0.6 * gauss(r)).toFixed(2),
			+(rate[2] + 0.6 * gauss(r)).toFixed(2),
		]);
	}
	return { fs, t0: new Date(0).toISOString(), s: rows };
}

/** Display orientation: slow posture × tremor part raised to `gain` (1 = true motion). */
export function amplified(f: ReplayFrame, gain: number): Quat {
	if (gain === 1) return f.q;
	let d = qmul(qconj(f.qSlow), f.q);
	if (d[0] < 0) d = [-d[0], -d[1], -d[2], -d[3]];
	const ang = 2 * Math.acos(Math.min(1, d[0]));
	if (ang < 1e-6) return f.q;
	const s = Math.sin(ang / 2);
	return qmul(f.qSlow, qAxis([d[1] / s, d[2] / s, d[3] / s], ang * gain));
}

// ---------- posture of the whole body (inferred, the band only sees the forearm) ----------
export type Posture = "seated" | "standing" | "walking";
export interface PostureGuess {
	posture: Posture;
	/** Where the forearm is: hanging along the body, resting (lap / armrest / table), raised toward the face. */
	forearm: "hanging" | "resting" | "raised";
	/** Forearm pitch at the strongest moment, degrees (+ = hand up). */
	pitch: number;
	why: string;
}

/**
 * Body posture from the forearm angle and the band's activity. Walking comes from the step counter (measured);
 * seated vs standing is a guess from the forearm angle (a rest tremor mostly happens with the forearm resting).
 */
export function inferPosture(r: Replay, activity?: string): PostureGuess {
	const f = frameAt(r, r.peakT);
	const fwd = qrot(f.qSlow, [1, 0, 0]);
	const pitch = Math.round(
		(Math.asin(Math.max(-1, Math.min(1, fwd[2]))) * 180) / Math.PI,
	);
	const forearm = pitch < -50 ? "hanging" : pitch > 35 ? "raised" : "resting";
	if (activity === "walk" || activity === "run")
		return {
			posture: "walking",
			forearm,
			pitch,
			why: `steps counted by the band · forearm ${pitch}°`,
		};
	if (forearm === "hanging")
		return {
			posture: "standing",
			forearm,
			pitch,
			why: `forearm hanging (${pitch}°), no steps: standing or arm down`,
		};
	if (pitch > 70)
		return {
			posture: "standing",
			forearm,
			pitch,
			why: `arm raised overhead (${pitch}°), no steps: standing with the arm up`,
		};
	if (forearm === "raised")
		return {
			posture: "seated",
			forearm,
			pitch,
			why: `forearm raised (${pitch}°): hand toward the face, likely seated`,
		};
	return {
		posture: "seated",
		forearm,
		pitch,
		why: `forearm near horizontal (${pitch}°), no steps: likely seated, forearm resting`,
	};
}
