"use client";
// Anatomical forearm + hand for the tremor replay. Built in code (no external mesh): radius and ulna, 13 forearm
// muscles that swell and glow with their estimated activation, tendons into the hand, articulated fingers and thumb,
// skin that can be made see-through, the band on the wrist and the wrist's path in space.
// Driven through refs: React never re-renders per frame, and nothing renders while nothing changes.
import { type MutableRefObject, useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ArmProfile } from "@/data/armProfile";
import {
	MUSCLES,
	type MuscleActivation,
	type MuscleId,
	type Posture,
	type Quat,
	type Vec3,
} from "@/lib/motionReplay";

export interface ModelState {
	/** Forearm orientation, world z-up quaternion (already amplified if wanted). */
	q: Quat;
	/** Hand oscillation, degrees (already amplified). */
	flex: number;
	dev: number;
	pro: number;
	level: number;
	act: MuscleActivation;
	/** Wrist displacement, metres (world z-up), already scaled for the trail. */
	disp: Vec3;
}

export type ModelView = "skin" | "muscles" | "bones";

const U = 0.1; // scene units per cm (1 unit = 10 cm)
const REST = "#9b3a34";
const HOT = new THREE.Color("#ff5a36");
const COOL = new THREE.Color(REST);
const TRAIL = 110;

/** IMU world (z up) -> three.js (y up). Proper rotation: (x, y, z) -> (x, z, -y). */
const toThreeQ = (q: Quat) => new THREE.Quaternion(q[1], q[3], -q[2], q[0]);
const toThreeV = (v: Vec3) => new THREE.Vector3(v[0], v[2], -v[1]);

interface Ring {
	x: number;
	w: number;
	h: number;
	cy?: number;
	cz?: number;
}

/** Tube with elliptical rings along x. */
function loft(rings: Ring[], radial = 28): THREE.BufferGeometry {
	const pos: number[] = [];
	const idx: number[] = [];
	for (const r of rings)
		for (let j = 0; j <= radial; j++) {
			const a = (j / radial) * Math.PI * 2;
			pos.push(
				r.x,
				(r.cy ?? 0) + r.h * Math.sin(a),
				(r.cz ?? 0) + r.w * Math.cos(a),
			);
		}
	const row = radial + 1;
	for (let i = 0; i < rings.length - 1; i++)
		for (let j = 0; j < radial; j++) {
			const a = i * row + j;
			idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
		}
	const g = new THREE.BufferGeometry();
	g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
	g.setIndex(idx);
	g.computeVertexNormals();
	return g;
}

/** Rounded end caps: rings shrinking like a half ellipsoid before `first` and after `last`. */
function capped(
	rings: Ring[],
	capLen: number,
	steps = 6,
	start = true,
	end = true,
): Ring[] {
	const out: Ring[] = [];
	const f = rings[0];
	const l = rings[rings.length - 1];
	if (start)
		for (let i = steps; i > 0; i--) {
			const t = i / steps;
			const s = Math.sqrt(1 - t * t);
			out.push({
				...f,
				x: f.x - capLen * t,
				w: f.w * s + 0.001,
				h: f.h * s + 0.001,
			});
		}
	out.push(...rings);
	if (end)
		for (let i = 1; i <= steps; i++) {
			const t = i / steps;
			const s = Math.sqrt(1 - t * t);
			out.push({
				...l,
				x: l.x + capLen * t,
				w: l.w * s + 0.001,
				h: l.h * s + 0.001,
			});
		}
	return out;
}

interface MuscleRig {
	id: MuscleId;
	mesh: THREE.Mesh;
	mat: THREE.MeshStandardMaterial;
	tendonMat: THREE.MeshStandardMaterial;
	centers: THREE.Vector3[];
	offsets: Float32Array;
	ring: number;
	bulge: number[];
	base: Float32Array;
}

export default function ForearmModel({
	state,
	tick,
	profile,
	side,
	view,
	trail,
	posture,
	cam,
}: {
	state: MutableRefObject<ModelState>;
	tick: MutableRefObject<number>;
	profile: ArmProfile;
	side: "left" | "right";
	view: ModelView;
	/** Show the wrist path. */
	trail: boolean;
	/** Whole-body posture for the low-detail mannequin around the forearm. */
	posture: Posture;
	/** Camera framing: whole body or close-up on the forearm. */
	cam: "body" | "arm";
}) {
	const host = useRef<HTMLDivElement>(null);
	const viewRef = useRef(view);
	const trailRef = useRef(trail);
	const apply = useRef<(() => void) | null>(null);
	const frame = useRef<((c: "body" | "arm") => void) | null>(null);
	const camRef = useRef(cam);
	viewRef.current = view;
	trailRef.current = trail;
	camRef.current = cam;

	useEffect(() => {
		frame.current?.(cam);
	}, [cam]);

	// view / trail are read through refs inside applyView: re-apply when they change
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional re-run triggers
	useEffect(() => {
		apply.current?.();
	}, [view, trail]);

	useEffect(() => {
		const el = host.current;
		if (!el) return;
		const s = side === "right" ? 1 : -1; // ulnar side is +z on a right arm
		const P = profile;
		const L = P.forearmLength * U;

		// ---------- renderer / scene ----------
		const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
		renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
		renderer.setClearColor("#0b1120");
		renderer.toneMapping = THREE.ACESFilmicToneMapping;
		renderer.outputColorSpace = THREE.SRGBColorSpace;
		el.appendChild(renderer.domElement);
		renderer.domElement.style.display = "block";
		const scene = new THREE.Scene();
		scene.fog = new THREE.Fog("#0b1120", 40, 90);
		const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 200);
		camera.position.set(1.4, 2.0, 5.2);
		const controls = new OrbitControls(camera, renderer.domElement);
		controls.enableDamping = true;
		controls.target.set(L * 0.75, -0.1, 0);
		controls.minDistance = 1.6;
		controls.maxDistance = 60;

		scene.add(new THREE.HemisphereLight("#dfe9ff", "#1a1410", 0.75));
		const key = new THREE.DirectionalLight("#fff4ea", 2.1);
		key.position.set(3, 5, 4);
		scene.add(key);
		const rim = new THREE.DirectionalLight("#7fb5ff", 1.2);
		rim.position.set(-4, 2, -3);
		scene.add(rim);
		const fill = new THREE.PointLight("#ffd9c4", 0.6, 12);
		fill.position.set(2, -2, 3);
		scene.add(fill);
		const grid = new THREE.GridHelper(48, 48, "#1e293b", "#131c2e");
		scene.add(grid); // floor at y = 0, body stands or sits on it

		// ---------- materials ----------
		const skinMat = new THREE.MeshPhysicalMaterial({
			color: P.skin,
			roughness: 0.55,
			sheen: 0.5,
			sheenColor: new THREE.Color(P.palm),
			sheenRoughness: 0.6,
			transparent: true,
			side: THREE.DoubleSide,
		});
		const nailMat = new THREE.MeshPhysicalMaterial({
			color: P.nail,
			roughness: 0.25,
			clearcoat: 0.6,
			transparent: true,
		});
		const boneMat = new THREE.MeshStandardMaterial({
			color: "#d8ccb2",
			roughness: 0.6,
			transparent: true,
		});
		const tendonBase = new THREE.MeshStandardMaterial({
			color: "#efe6da",
			roughness: 0.35,
			transparent: true,
		});
		const bandMat = new THREE.MeshStandardMaterial({
			color: "#1d2433",
			roughness: 0.5,
			metalness: 0.2,
		});
		const ledMat = new THREE.MeshBasicMaterial({ color: "#2dd4bf" });
		const disposables: { dispose(): void }[] = [
			skinMat,
			nailMat,
			boneMat,
			tendonBase,
			bandMat,
			ledMat,
		];
		const own = <T extends { dispose(): void }>(x: T) => {
			disposables.push(x);
			return x;
		};

		// ---------- forearm shape ----------
		const bump = (u: number) =>
			u < 0.22
				? 0.86 + 0.14 * Math.sin(((u / 0.22) * Math.PI) / 2)
				: Math.cos(((u - 0.22) / 0.78) * (Math.PI / 2)) ** 1.25;
		const halfW = (u: number) =>
			0.5 *
			U *
			(P.wristWidth +
				(P.bellyWidth - P.wristWidth) * bump(Math.min(1, Math.max(0, u))));
		const halfH = (u: number) =>
			0.5 *
			U *
			(P.wristThickness +
				(P.bellyThickness - P.wristThickness) *
					bump(Math.min(1, Math.max(0, u))));
		const cyAt = (u: number) => -0.012 * bump(Math.min(1, Math.max(0, u)));
		/** Point inside the forearm: u along (0 elbow, 1 wrist), θ around (0 ulnar, 90 dorsal, 180 radial, 270 palmar), k depth (1 = skin). */
		const at = (u: number, th: number, k: number) => {
			const a = (th * Math.PI) / 180;
			return new THREE.Vector3(
				u * L,
				cyAt(u) + k * halfH(u) * Math.sin(a),
				s * k * halfW(u) * Math.cos(a),
			);
		};

		const forearm = new THREE.Group(); // pivots at the elbow
		scene.add(forearm);

		// ---------- low-detail body (mannequin): only the forearm is anatomical ----------
		// Joints in scene units for a 165 cm person, x forward, y up, z to the right; scaled to the profile height.
		const kH = P.height / 165;
		const half = (P.shoulderWidth * U) / 2;
		const J = (x: number, y: number, z: number) =>
			new THREE.Vector3(x * kH, y * kH, z * kH);
		const seated = posture === "seated";
		const walking = posture === "walking";
		const hipY = seated ? 4.8 : 8.7;
		const lift = hipY - 8.7; // seated body = standing upper body moved down
		const shoulderY = 13.6 + lift;
		const shoulder = new THREE.Vector3(-0.1 * kH, shoulderY * kH, s * half);
		const otherShoulder = new THREE.Vector3(
			-0.1 * kH,
			shoulderY * kH,
			-s * half,
		);
		const bodyMat = own(
			new THREE.MeshStandardMaterial({
				color: "#5b6b82",
				roughness: 0.85,
				transparent: true,
				opacity: 0.92,
			}),
		);
		const armMat = own(
			new THREE.MeshStandardMaterial({ color: "#7d8ca3", roughness: 0.8 }),
		);
		const chairMat = own(
			new THREE.MeshStandardMaterial({ color: "#2a3448", roughness: 0.9 }),
		);
		const body = new THREE.Group();
		scene.add(body);
		const limb = (
			a: THREE.Vector3,
			b: THREE.Vector3,
			r: number,
			mat: THREE.Material = bodyMat,
		) => {
			const len = a.distanceTo(b);
			const m = new THREE.Mesh(
				own(
					new THREE.CapsuleGeometry(
						r * kH,
						Math.max(0.01, len - r * kH),
						6,
						14,
					),
				),
				mat,
			);
			m.position.copy(a).add(b).multiplyScalar(0.5);
			m.quaternion.setFromUnitVectors(
				new THREE.Vector3(0, 1, 0),
				b.clone().sub(a).normalize(),
			);
			body.add(m);
			return m;
		};
		const ball = (
			c: THREE.Vector3,
			r: number,
			mat: THREE.Material = bodyMat,
		) => {
			const m = new THREE.Mesh(
				own(new THREE.SphereGeometry(r * kH, 20, 16)),
				mat,
			);
			m.position.copy(c);
			body.add(m);
			return m;
		};
		// torso, neck, head
		const pelvis = J(0, hipY + 0.3, 0);
		const chest = J(-0.15, 12.2 + lift, 0);
		const torso = limb(pelvis, chest, 1.1);
		torso.scale.set(0.8, 1, (half / kH / 1.1) * 0.75);
		limb(J(-0.15, 13.4 + lift, 0), J(-0.1, 14.5 + lift, 0), 0.45);
		const head = ball(J(0, 15.5 + lift, 0), 1.0);
		head.scale.set(1.05, 1.2, 0.95);
		ball(J(0.95, 15.5 + lift, 0), 0.16); // nose: shows which way the person faces
		ball(shoulder, 0.55, armMat);
		ball(otherShoulder, 0.55);
		// legs
		for (const side3 of [1, -1]) {
			const z = side3 * 0.9;
			const hip = J(0, hipY, z);
			const fwd = walking ? side3 * s * 1.0 : 0;
			const knee = seated
				? J(4.2, hipY + 0.2, z * 1.05)
				: J(0.35 + fwd * 0.5, 4.6, z);
			const foot = seated ? J(4.5, 0.35, z * 1.05) : J(fwd * 1.2, 0.35, z);
			limb(hip, knee, 0.68);
			limb(knee, foot, 0.5);
			const shoe = ball(foot.clone().add(J(0.45, -0.05, 0)), 0.45);
			shoe.scale.set(1.9, 0.6, 0.9);
		}
		// the other arm: along the body, or resting on the thigh when seated
		{
			const elbow = seated
				? J(0.2, 10.1 + lift - 3.0, -s * 1.95)
				: J(walking ? -0.6 : 0, 10.6, -s * 1.95);
			const wrist = seated
				? J(2.6, hipY + 0.95, -s * 1.25)
				: J(walking ? -0.9 : 0.3, 8.1, -s * 1.9);
			limb(otherShoulder, elbow, 0.42);
			limb(elbow, wrist, 0.34);
			const hd = ball(
				wrist.clone().add(J(seated ? 0.7 : 0.1, seated ? 0 : -0.7, 0)),
				0.42,
			);
			hd.scale.set(seated ? 1.6 : 0.9, seated ? 0.6 : 1.6, 0.8);
		}
		// chair with armrests at elbow height when seated
		if (seated) {
			const box = (
				w: number,
				h: number,
				d: number,
				x: number,
				y: number,
				z: number,
			) => {
				const m = new THREE.Mesh(
					own(new THREE.BoxGeometry(w * kH, h * kH, d * kH)),
					chairMat,
				);
				m.position.set(x * kH, y * kH, z * kH);
				body.add(m);
			};
			box(4.8, 0.4, 4.6, 1.4, hipY - 0.8, 0); // seat
			box(0.4, 5.4, 4.6, -1.15, hipY + 2.0, 0); // back
			// armrest under the tracked elbow: explains a forearm held level above the lap
			const restY = (shoulder.y - P.upperArmLength * U * 0.95) / kH - 0.55;
			box(3.6, 0.3, 0.7, 0.9, restY, s * 2.15);
			box(
				0.3,
				restY - hipY + 0.8,
				0.3,
				-0.6,
				(restY + hipY - 0.8) / 2,
				s * 2.15,
			);
			box(
				0.3,
				restY - hipY + 0.8,
				0.3,
				2.4,
				(restY + hipY - 0.8) / 2,
				s * 2.15,
			);
			for (const z of [-2.1, 2.1]) {
				box(0.3, hipY - 1.0, 0.3, 3.5, (hipY - 1.0) / 2, z);
				box(0.3, hipY - 1.0, 0.3, -0.8, (hipY - 1.0) / 2, z);
			}
		}
		// tracked upper arm: shoulder to elbow, re-aimed every frame from the measured forearm direction
		const upperLen = P.upperArmLength * U;
		const upperArm = new THREE.Mesh(
			own(new THREE.CapsuleGeometry(0.4 * kH, upperLen - 0.4 * kH, 6, 16)),
			armMat,
		);
		body.add(upperArm);
		const elbowBall = new THREE.Mesh(
			own(new THREE.SphereGeometry(0.36 * kH, 16, 12)),
			armMat,
		);
		body.add(elbowBall);
		const DOWN = new THREE.Vector3(0, -1, 0);
		const FWD = new THREE.Vector3(1, 0, 0);
		const UP = new THREE.Vector3(0, 1, 0);
		const elbowPos = new THREE.Vector3();
		const dir = new THREE.Vector3();
		const uArm = new THREE.Vector3();
		/** Heading is unknown (no compass): forearm assumed pointing forward, turned a little toward the body midline. */
		const inward = new THREE.Quaternion().setFromAxisAngle(UP, s * 0.22);
		const placeArm = () => {
			dir.set(1, 0, 0).applyQuaternion(forearm.quaternion);
			// upper arm hangs from the shoulder, swung toward where the forearm points (elbow never hyperextends)
			uArm
				.copy(DOWN)
				.addScaledVector(dir, 0.32)
				.addScaledVector(FWD, 0.08)
				.normalize();
			elbowPos.copy(shoulder).addScaledVector(uArm, upperLen);
			forearm.position.copy(elbowPos);
			upperArm.position.copy(shoulder).addScaledVector(uArm, upperLen / 2);
			upperArm.quaternion.setFromUnitVectors(UP, uArm.clone().negate());
			elbowBall.position.copy(elbowPos);
		};

		const skinRings: Ring[] = [];
		for (let i = 0; i <= 40; i++) {
			const u = -0.04 + (i / 40) * 1.06;
			skinRings.push({ x: u * L, w: halfW(u), h: halfH(u), cy: cyAt(u) });
		}
		const skin = new THREE.Mesh(
			own(loft(capped(skinRings, 0.22, 7, true, false), 40)),
			skinMat,
		);
		skin.renderOrder = 10;
		forearm.add(skin);

		// bones
		const boneShaft = (
			u0: number,
			u1: number,
			r: (t: number) => number,
			th: number,
			k: number,
		) => {
			const rings: Ring[] = [];
			for (let i = 0; i <= 24; i++) {
				const t = i / 24;
				const u = u0 + (u1 - u0) * t;
				const c = at(u, th, k);
				rings.push({ x: c.x, w: r(t), h: r(t), cy: c.y, cz: c.z });
			}
			return new THREE.Mesh(own(loft(capped(rings, 0.05, 4), 16)), boneMat);
		};
		const ulna = boneShaft(
			-0.06,
			0.97,
			(t) =>
				0.022 +
				0.05 * (1 - t) ** 3 +
				0.012 * Math.exp(-(((t - 0.96) / 0.04) ** 2)),
			0,
			0.42,
		);
		const radius = boneShaft(
			0.03,
			1.0,
			(t) => 0.02 + 0.04 * t ** 3 + 0.01 * Math.exp(-((t / 0.05) ** 2)),
			185,
			0.42,
		);
		const bones = new THREE.Group();
		bones.add(ulna, radius);
		forearm.add(bones);

		// muscles: path of (u, θ, k), belly radius (cm), share of the path that is muscle (rest is tendon)
		const DEF: Record<
			MuscleId,
			{
				path: [number, number, number][];
				r: number;
				belly: number;
				deep?: boolean;
			}
		> = {
			BR: {
				path: [
					[-0.12, 168, 0.8],
					[0.25, 172, 0.84],
					[0.6, 180, 0.78],
					[0.97, 186, 0.7],
				],
				r: 0.95,
				belly: 0.62,
			},
			ECRL: {
				path: [
					[-0.06, 148, 0.78],
					[0.3, 146, 0.8],
					[0.65, 150, 0.76],
					[0.98, 158, 0.66],
				],
				r: 0.95,
				belly: 0.55,
			},
			ECRB: {
				path: [
					[0.02, 128, 0.78],
					[0.35, 126, 0.8],
					[0.7, 132, 0.76],
					[0.99, 140, 0.66],
				],
				r: 0.9,
				belly: 0.62,
			},
			ED: {
				path: [
					[0.04, 98, 0.78],
					[0.4, 96, 0.8],
					[0.75, 94, 0.76],
					[1.0, 92, 0.66],
				],
				r: 0.95,
				belly: 0.66,
			},
			ECU: {
				path: [
					[0.04, 50, 0.78],
					[0.4, 42, 0.8],
					[0.75, 30, 0.76],
					[1.0, 18, 0.66],
				],
				r: 0.8,
				belly: 0.72,
			},
			APL: {
				path: [
					[0.45, 112, 0.6],
					[0.7, 132, 0.78],
					[0.9, 160, 0.8],
					[1.0, 176, 0.72],
				],
				r: 0.55,
				belly: 0.6,
			},
			SUP: {
				path: [
					[0.0, 70, 0.5],
					[0.12, 110, 0.55],
					[0.26, 150, 0.55],
					[0.34, 172, 0.5],
				],
				r: 0.75,
				belly: 1,
				deep: true,
			},
			PT: {
				path: [
					[-0.02, 300, 0.76],
					[0.18, 268, 0.82],
					[0.36, 232, 0.8],
					[0.46, 205, 0.72],
				],
				r: 0.9,
				belly: 0.85,
			},
			FCR: {
				path: [
					[0.0, 296, 0.8],
					[0.35, 272, 0.84],
					[0.7, 252, 0.8],
					[0.99, 238, 0.68],
				],
				r: 0.9,
				belly: 0.6,
			},
			PL: {
				path: [
					[0.0, 282, 0.84],
					[0.35, 270, 0.88],
					[0.7, 268, 0.84],
					[1.0, 268, 0.74],
				],
				r: 0.5,
				belly: 0.5,
			},
			FCU: {
				path: [
					[-0.02, 332, 0.8],
					[0.35, 330, 0.84],
					[0.7, 338, 0.8],
					[1.0, 348, 0.68],
				],
				r: 1.0,
				belly: 0.75,
			},
			FDS: {
				path: [
					[0.06, 300, 0.56],
					[0.4, 280, 0.62],
					[0.75, 272, 0.6],
					[1.0, 270, 0.5],
				],
				r: 1.15,
				belly: 0.72,
				deep: true,
			},
			PQ: {
				path: [
					[0.86, 205, 0.5],
					[0.86, 240, 0.58],
					[0.86, 285, 0.58],
					[0.86, 330, 0.5],
				],
				r: 0.5,
				belly: 1,
				deep: true,
			},
		};

		const rigs: MuscleRig[] = [];
		const muscleGroup = new THREE.Group();
		forearm.add(muscleGroup);
		const SEG = 30;
		const RAD = 16;
		for (const m of MUSCLES) {
			const d = DEF[m.id];
			const curve = new THREE.CatmullRomCurve3(
				d.path.map(([u, th, k]) => at(u, th, k * 0.9)),
			);
			const rB = d.r * U * 1.3; // belly half-width: r is roughly the belly radius in cm
			const centers: THREE.Vector3[] = [];
			const pos: number[] = [];
			const offsets: number[] = [];
			const bulge: number[] = [];
			for (let i = 0; i <= SEG; i++) {
				const t = (i / SEG) * d.belly;
				const c = curve.getPointAt(t);
				const tan = curve.getTangentAt(t);
				const axisPt = new THREE.Vector3(c.x, cyAt(c.x / L), 0);
				const out = c.clone().sub(axisPt);
				out.addScaledVector(tan, -out.dot(tan)).normalize();
				const bin = new THREE.Vector3().crossVectors(tan, out).normalize();
				const v = i / SEG;
				const prof = Math.max(
					0.08,
					Math.sin(Math.PI * Math.min(1, v * 1.02)) ** 0.75,
				);
				const r = rB * prof;
				centers.push(c);
				bulge.push(Math.sin(Math.PI * v));
				for (let j = 0; j <= RAD; j++) {
					const a = (j / RAD) * Math.PI * 2;
					const o = out
						.clone()
						.multiplyScalar(Math.cos(a) * r * 0.55)
						.addScaledVector(bin, Math.sin(a) * r);
					offsets.push(o.x, o.y, o.z);
					pos.push(c.x + o.x, c.y + o.y, c.z + o.z);
				}
			}
			const idx: number[] = [];
			const row = RAD + 1;
			for (let i = 0; i < SEG; i++)
				for (let j = 0; j < RAD; j++) {
					const a = i * row + j;
					idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
				}
			const g = own(new THREE.BufferGeometry());
			g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
			g.setIndex(idx);
			g.computeVertexNormals();
			const mat = own(
				new THREE.MeshStandardMaterial({
					color: REST,
					roughness: 0.42,
					metalness: 0.05,
					emissive: "#ff3b1f",
					emissiveIntensity: 0,
					transparent: true,
					side: THREE.DoubleSide,
				}),
			);
			const mesh = new THREE.Mesh(g, mat);
			mesh.userData.muscle = m.id;
			muscleGroup.add(mesh);
			const tendonMat = own(tendonBase.clone());
			if (d.belly < 1) {
				const tc = new THREE.CatmullRomCurve3(
					Array.from({ length: 6 }, (_, i) =>
						curve.getPointAt(d.belly + ((1 - d.belly) * i) / 5),
					),
				);
				const tm = new THREE.Mesh(
					own(new THREE.TubeGeometry(tc, 16, 0.011, 6)),
					tendonMat,
				);
				muscleGroup.add(tm);
			}
			rigs.push({
				id: m.id,
				mesh,
				mat,
				tendonMat,
				centers,
				offsets: new Float32Array(offsets),
				ring: row,
				bulge,
				base: new Float32Array(pos),
			});
		}

		// ---------- band ----------
		const bandU = 0.9;
		const bandRings: Ring[] = [];
		for (let i = 0; i <= 6; i++) {
			const u = bandU + (i / 6) * 0.06;
			bandRings.push({
				x: u * L,
				w: halfW(u) * 1.07 + 0.012,
				h: halfH(u) * 1.1 + 0.012,
				cy: cyAt(u),
			});
		}
		const band = new THREE.Mesh(own(loft(bandRings, 40)), bandMat);
		forearm.add(band);
		const pod = new THREE.Mesh(
			own(new THREE.BoxGeometry(0.34, 0.09, 0.3)),
			bandMat,
		);
		const podPos = at(bandU + 0.03, 90, 1.12);
		pod.position.copy(podPos);
		forearm.add(pod);
		const led = new THREE.Mesh(
			own(new THREE.SphereGeometry(0.022, 12, 10)),
			ledMat,
		);
		led.position.copy(podPos).add(new THREE.Vector3(0.08, 0.05, 0));
		forearm.add(led);

		// ---------- hand ----------
		const wristJoint = new THREE.Group();
		wristJoint.position.set(L, cyAt(1), 0);
		forearm.add(wristJoint);
		const hand = new THREE.Group();
		wristJoint.add(hand);
		const wristBall = new THREE.Mesh(
			own(new THREE.SphereGeometry(1, 28, 20)),
			skinMat,
		);
		wristBall.scale.set(0.16, halfH(1) * 0.98, halfW(1) * 0.98);
		wristBall.renderOrder = 10;
		hand.add(wristBall);

		const pl = P.palmLength * U;
		const pb = P.palmBreadth * U;
		const ww = P.wristWidth * U;
		const shape = new THREE.Shape();
		const pts: [number, number][] = [
			[0.02, -ww * 0.48],
			[pl * 0.25, -pb * 0.56],
			[pl * 0.5, -pb * 0.54],
			[pl * 0.82, -pb * 0.5],
			[pl * 0.98, -pb * 0.36],
			[pl * 1.02, -pb * 0.1],
			[pl * 1.0, pb * 0.14],
			[pl * 0.95, pb * 0.36],
			[pl * 0.85, pb * 0.5],
			[pl * 0.45, pb * 0.52],
			[pl * 0.15, pb * 0.47],
			[0.02, ww * 0.46],
		];
		const sp = pts.map(
			([x, z]) => new THREE.Vector2(x * 0.93 + 0.03, z * s * 0.84),
		);
		shape.setFromPoints(new THREE.SplineCurve([...sp, sp[0]]).getPoints(60));
		const thick = 0.07;
		const palmGeo = own(
			new THREE.ExtrudeGeometry(shape, {
				depth: thick,
				bevelEnabled: true,
				bevelThickness: 0.1,
				bevelSize: 0.075,
				bevelSegments: 8,
				curveSegments: 24,
			}),
		);
		palmGeo.translate(0, 0, -thick / 2);
		palmGeo.rotateX(Math.PI / 2); // shape (x, z) plane, extrusion along y
		palmGeo.computeVertexNormals();
		const palm = new THREE.Mesh(palmGeo, skinMat);
		palm.position.y = -0.01;
		palm.renderOrder = 10;
		hand.add(palm);

		// carpals and metacarpals (seen through the skin)
		for (let i = 0; i < 8; i++) {
			const c = new THREE.Mesh(
				own(new THREE.SphereGeometry(0.035, 10, 8)),
				boneMat,
			);
			c.position.set(
				0.05 + (i % 2) * 0.08,
				-0.01,
				s * (-0.15 + Math.floor(i / 2) * 0.1),
			);
			hand.add(c);
		}

		type Seg = { group: THREE.Group; rest: number };
		const fingerRigs: Seg[][] = [];
		const knuckles = [
			{ x: pl * 0.97, z: -0.36 * pb, splay: 0.07, curl: [0.22, 0.38, 0.26] },
			{ x: pl * 1.0, z: -0.12 * pb, splay: 0.0, curl: [0.28, 0.44, 0.3] },
			{ x: pl * 0.97, z: 0.13 * pb, splay: -0.06, curl: [0.34, 0.5, 0.34] },
			{ x: pl * 0.9, z: 0.37 * pb, splay: -0.13, curl: [0.42, 0.56, 0.38] },
		];
		const phalanx = (
			parent: THREE.Object3D,
			len: number,
			r: number,
			nail: boolean,
		) => {
			const skinC = new THREE.Mesh(
				own(new THREE.CapsuleGeometry(r, Math.max(0.01, len - r * 1.2), 6, 14)),
				skinMat,
			);
			skinC.rotation.z = -Math.PI / 2;
			skinC.position.x = len / 2;
			skinC.renderOrder = 10;
			parent.add(skinC);
			const b = new THREE.Mesh(
				own(
					new THREE.CapsuleGeometry(
						r * 0.4,
						Math.max(0.01, len - r * 1.1),
						4,
						8,
					),
				),
				boneMat,
			);
			b.rotation.z = -Math.PI / 2;
			b.position.x = len / 2;
			parent.add(b);
			if (nail) {
				const n = new THREE.Mesh(
					own(new THREE.SphereGeometry(1, 14, 10)),
					nailMat,
				);
				n.scale.set(len * 0.32, r * 0.25, r * 0.78);
				n.position.set(len * 0.66, r * 0.82, 0);
				n.renderOrder = 11;
				parent.add(n);
			}
		};
		knuckles.forEach((k, fi) => {
			const fl = P.fingers[fi] * U;
			const lens = [0.46, 0.3, 0.24].map((f) => f * fl);
			let r = P.fingerWidth * U * 0.5 * (fi === 3 ? 0.85 : 1);
			const root = new THREE.Group();
			root.position.set(k.x, -0.005, k.z * s);
			root.rotation.y = k.splay * s;
			hand.add(root);
			// metacarpal bone
			const mc = new THREE.Mesh(
				own(new THREE.CapsuleGeometry(0.018, k.x * 0.7, 4, 8)),
				boneMat,
			);
			mc.rotation.z = -Math.PI / 2;
			mc.position.set(-k.x * 0.45, 0, 0);
			root.add(mc);
			const segs: Seg[] = [];
			let parent: THREE.Object3D = root;
			lens.forEach((len, j) => {
				const g = new THREE.Group();
				if (j > 0) g.position.x = lens[j - 1];
				g.rotation.z = -k.curl[j];
				parent.add(g);
				phalanx(g, len, r, j === 2);
				segs.push({ group: g, rest: k.curl[j] });
				r *= 0.84;
				parent = g;
			});
			fingerRigs.push(segs);
		});
		// thumb: from the base of the palm, pointing to the radial side and the palm
		const thumbRoot = new THREE.Group();
		thumbRoot.position.set(pl * 0.16, -0.06, -s * pb * 0.42);
		thumbRoot.rotation.set(0, s * 0.75, -0.2);
		hand.add(thumbRoot);
		const thumb: Seg[] = [];
		{
			const tl = P.fingers[4] * U;
			const lens = [0.42, 0.32, 0.26].map((f) => f * tl);
			let r = P.fingerWidth * U * 0.62;
			let parent: THREE.Object3D = thumbRoot;
			const rest = [0.1, 0.22, 0.2];
			lens.forEach((len, j) => {
				const g = new THREE.Group();
				if (j > 0) g.position.x = lens[j - 1];
				g.rotation.z = -rest[j];
				parent.add(g);
				phalanx(g, len, r, j === 2);
				thumb.push({ group: g, rest: rest[j] });
				r *= 0.86;
				parent = g;
			});
		}

		// long finger tendons in the hand: extensor digitorum on the back, flexor digitorum on the palm
		const handTendons: { mat: THREE.MeshStandardMaterial; id: MuscleId }[] = [];
		for (const [id, y] of [
			["ED", 0.1],
			["FDS", -0.11],
		] as [MuscleId, number][]) {
			const mat = own(tendonBase.clone());
			handTendons.push({ mat, id });
			for (const k of knuckles) {
				const c = new THREE.CatmullRomCurve3([
					new THREE.Vector3(-0.05, y * 0.8, k.z * s * 0.35),
					new THREE.Vector3(k.x * 0.5, y, k.z * s * 0.75),
					new THREE.Vector3(k.x, y * 0.7, k.z * s),
				]);
				hand.add(
					new THREE.Mesh(own(new THREE.TubeGeometry(c, 12, 0.009, 5)), mat),
				);
			}
		}

		// ---------- wrist path ----------
		const trailPos = new Float32Array(TRAIL * 3);
		const trailCol = new Float32Array(TRAIL * 3);
		const trailGeo = own(new THREE.BufferGeometry());
		trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPos, 3));
		trailGeo.setAttribute("color", new THREE.BufferAttribute(trailCol, 3));
		const trailLine = new THREE.Line(
			trailGeo,
			own(
				new THREE.LineBasicMaterial({ vertexColors: true, transparent: true }),
			),
		);
		trailLine.frustumCulled = false;
		scene.add(trailLine);
		let trailN = 0;
		const bandLocal = at(bandU + 0.03, 90, 1.2);

		// ---------- view modes ----------
		const applyView = () => {
			const v = viewRef.current;
			const ghost = v !== "skin";
			skinMat.opacity = v === "skin" ? 1 : v === "muscles" ? 0.17 : 0.1;
			skinMat.depthWrite = !ghost;
			nailMat.opacity = ghost ? 0.3 : 1;
			muscleGroup.visible = true;
			for (const r of rigs) {
				r.mat.opacity = v === "bones" ? 0.22 : 1;
				r.mat.depthWrite = v !== "bones";
				r.tendonMat.opacity = v === "bones" ? 0.25 : 1;
			}
			for (const t of handTendons) t.mat.opacity = v === "bones" ? 0.25 : 1;
			boneMat.opacity = 1;
			trailLine.visible = trailRef.current;
			dirty = true;
		};

		// ---------- per-frame state ----------
		const tmp = new THREE.Vector3();
		const update = () => {
			const st = state.current;
			forearm.quaternion.copy(inward).multiply(toThreeQ(st.q));
			placeArm();
			const d2r = Math.PI / 180;
			// band sits above the wrist: the hand moves more than the forearm it measures (estimated ×1.5)
			hand.rotation.set(0, st.dev * 1.5 * d2r * s, -st.flex * 1.5 * d2r);
			fingerRigs.forEach((segs, fi) => {
				segs.forEach((sg, j) => {
					sg.group.rotation.z = -(
						sg.rest +
						(st.flex * (0.8 + 0.15 * fi) + st.pro * 0.4) *
							d2r *
							(j === 0 ? 1 : 0.6)
					);
				});
			});
			thumb.forEach((sg, j) => {
				sg.group.rotation.z = -(
					sg.rest +
					st.pro * 1.2 * d2r * (j === 0 ? 1 : 0.5)
				);
			});
			for (const r of rigs) {
				const a = st.act[r.id] ?? 0;
				const p = r.mesh.geometry.getAttribute(
					"position",
				) as THREE.BufferAttribute;
				const arr = p.array as Float32Array;
				const c0 = r.centers[0];
				for (let i = 0; i < r.centers.length; i++) {
					const c = r.centers[i];
					const sh = 1 - 0.05 * a; // shortens toward its origin
					const cx = c0.x + (c.x - c0.x) * sh;
					const cy = c0.y + (c.y - c0.y) * sh;
					const cz = c0.z + (c.z - c0.z) * sh;
					const sw = 1 + 0.34 * a * r.bulge[i];
					for (let j = 0; j < r.ring; j++) {
						const k = (i * r.ring + j) * 3;
						arr[k] = cx + r.offsets[k] * sw;
						arr[k + 1] = cy + r.offsets[k + 1] * sw;
						arr[k + 2] = cz + r.offsets[k + 2] * sw;
					}
				}
				p.needsUpdate = true;
				r.mesh.geometry.computeVertexNormals();
				r.mat.color.copy(COOL).lerp(HOT, a);
				r.mat.emissiveIntensity = a * a * 0.9;
				r.tendonMat.emissive.set("#ff6a3d");
				r.tendonMat.emissiveIntensity = a * 0.35;
			}
			for (const t of handTendons) {
				t.mat.emissive.set("#ff6a3d");
				t.mat.emissiveIntensity = (st.act[t.id] ?? 0) * 0.4;
			}
			ledMat.color.set(st.level > 0.35 ? "#f87171" : "#2dd4bf");
			// wrist path: band point in the world + measured displacement
			forearm.updateMatrixWorld();
			tmp
				.copy(bandLocal)
				.applyMatrix4(forearm.matrixWorld)
				.add(toThreeV(st.disp).multiplyScalar(10));
			trailPos.copyWithin(3, 0, (TRAIL - 1) * 3);
			trailPos[0] = tmp.x;
			trailPos[1] = tmp.y;
			trailPos[2] = tmp.z;
			trailN = Math.min(TRAIL, trailN + 1);
			for (let i = 0; i < TRAIL; i++) {
				const f = i < trailN ? 1 - i / trailN : 0;
				trailCol[i * 3] = 0.18 * f;
				trailCol[i * 3 + 1] = 0.83 * f;
				trailCol[i * 3 + 2] = 0.75 * f;
			}
			if (trailN < TRAIL)
				for (let i = trailN; i < TRAIL; i++)
					trailPos.copyWithin(i * 3, (trailN - 1) * 3, trailN * 3);
			trailGeo.attributes.position.needsUpdate = true;
			trailGeo.attributes.color.needsUpdate = true;
		};

		// ---------- loop: draws only when something changed ----------
		let dirty = true;
		let lastTick = -1;
		controls.addEventListener("change", () => {
			dirty = true;
		});
		const resize = () => {
			const w = el.clientWidth || 600;
			const h = el.clientHeight || 380;
			renderer.setSize(w, h);
			camera.aspect = w / h;
			camera.updateProjectionMatrix();
			dirty = true;
		};
		const ro = new ResizeObserver(resize);
		ro.observe(el);
		resize();
		apply.current = applyView;
		applyView();
		const frameCam = (c: "body" | "arm") => {
			forearm.updateMatrixWorld();
			const mid = new THREE.Vector3(L * 0.7, 0, 0).applyMatrix4(
				forearm.matrixWorld,
			);
			if (c === "arm") {
				controls.target.copy(mid);
				camera.position.copy(mid).add(new THREE.Vector3(1.6, 2.2, 5.6 * s));
			} else {
				const center = new THREE.Vector3(
					1.0 * kH,
					(seated ? 7.0 : 8.2) * kH,
					0,
				);
				controls.target.copy(center);
				camera.position
					.copy(center)
					.add(
						new THREE.Vector3(14, 5, 22 * s).multiplyScalar(
							kH * (seated ? 1 : 1.18),
						),
					);
			}
			controls.update();
			dirty = true;
		};
		frame.current = frameCam;
		update();
		frameCam(camRef.current);
		let raf = 0;
		const loop = () => {
			controls.update();
			if (tick.current !== lastTick) {
				if (tick.current < lastTick) trailN = 0; // seek back / restart clears the path
				lastTick = tick.current;
				update();
				dirty = true;
			}
			if (dirty) {
				renderer.render(scene, camera);
				dirty = false;
			}
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);

		return () => {
			cancelAnimationFrame(raf);
			ro.disconnect();
			controls.dispose();
			apply.current = null;
			frame.current = null;
			for (const d of disposables) d.dispose();
			renderer.dispose();
			renderer.domElement.remove();
		};
	}, [profile, side, state, tick, posture]);

	return <div ref={host} className="h-full w-full" />;
}
