"use client";
// 3D hand rebuilt from the band's wrist motion, in a dark scene. Driven through a ref so React never re-renders per frame.
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export interface HandPose {
	/** Wrist flexion/extension, degrees. */
	tilt: number;
	/** Forearm roll, degrees. */
	roll: number;
	/** Finger / thumb oscillation, -1..1 scaled by amplitude. */
	fingers: number;
	/** Acceleration without gravity, g. */
	accel: [number, number, number];
	/** 0..1, how strong the tremor is now. */
	level: number;
	/** Antagonist muscle activation, 0..1 each: flexors (palm side) and extensors (back). Tremor alternates them. */
	flexor?: number;
	extensor?: number;
}

const FINGERS = [
	{ x: -0.33, len: [0.42, 0.26, 0.2], r: 0.056, curl: [0.22, 0.34, 0.26] },
	{ x: -0.11, len: [0.46, 0.29, 0.22], r: 0.06, curl: [0.28, 0.4, 0.3] },
	{ x: 0.11, len: [0.42, 0.27, 0.2], r: 0.057, curl: [0.34, 0.44, 0.32] },
	{ x: 0.33, len: [0.32, 0.2, 0.17], r: 0.05, curl: [0.4, 0.46, 0.34] },
];

const BONE = new THREE.MeshStandardMaterial({
	color: "#9fd0ff",
	emissive: "#0a3a78",
	emissiveIntensity: 0.9,
	roughness: 0.35,
	metalness: 0.1,
	transparent: true,
	opacity: 0.9,
});
const JOINT = new THREE.MeshStandardMaterial({
	color: "#e6f3ff",
	emissive: "#3b9bff",
	emissiveIntensity: 1.2,
	roughness: 0.3,
});

function bone(len: number, r: number) {
	const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 14), BONE);
	m.position.y = len / 2 + r * 0.2;
	return m;
}
const joint = (r: number) =>
	new THREE.Mesh(new THREE.SphereGeometry(r * 1.12, 14, 12), JOINT);

/** Chain of bones; returns the root and the joint groups (to bend them). */
function chain(len: number[], r: number, curl: number[]) {
	const root = new THREE.Group();
	const joints: THREE.Group[] = [];
	let parent: THREE.Object3D = root;
	len.forEach((l, i) => {
		const g = new THREE.Group();
		g.rotation.x = curl[i];
		g.add(joint(r * (1 - i * 0.08)));
		g.add(bone(l, r * (1 - i * 0.1)));
		parent.add(g);
		joints.push(g);
		const next = new THREE.Group();
		next.position.y = l + r * 0.4;
		g.add(next);
		parent = next;
	});
	return { root, joints, tip: parent };
}

export default function Hand3D({
	pose,
	active,
}: {
	pose: React.RefObject<HandPose>;
	active: boolean;
}) {
	const host = useRef<HTMLDivElement>(null);
	const activeRef = useRef(active);
	activeRef.current = active;

	useEffect(() => {
		const el = host.current;
		if (!el) return;
		const scene = new THREE.Scene();
		scene.background = new THREE.Color("#04060c");
		scene.fog = new THREE.Fog("#04060c", 6, 14);
		const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
		camera.position.set(3.2, 0.9, 5.4);
		const renderer = new THREE.WebGLRenderer({ antialias: true });
		renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
		el.appendChild(renderer.domElement);
		renderer.domElement.style.display = "block";
		const controls = new OrbitControls(camera, renderer.domElement);
		controls.target.set(0, -0.2, 0);
		controls.enableDamping = true;
		controls.enablePan = false;
		controls.minDistance = 2.5;
		controls.maxDistance = 8;

		scene.add(new THREE.AmbientLight("#4a6fa5", 0.7));
		const key = new THREE.PointLight("#5aa2ff", 28, 14);
		key.position.set(2.5, 3.5, 3);
		scene.add(key);
		const rim = new THREE.PointLight("#7c5cff", 14, 12);
		rim.position.set(-3, 1.5, -2);
		scene.add(rim);

		const grid = new THREE.GridHelper(12, 36, "#16315c", "#0c1a33");
		grid.position.y = -2.3;
		scene.add(grid);

		// forearm: translucent skin + muscle bellies that light up with the tremor
		const arm = new THREE.Mesh(
			new THREE.CapsuleGeometry(0.27, 1.9, 8, 20),
			BONE.clone(),
		);
		(arm.material as THREE.MeshStandardMaterial).opacity = 0.14;
		arm.position.y = -1.2;
		scene.add(arm);
		const muscleMat = (c: string) =>
			new THREE.MeshStandardMaterial({
				color: "#5a1f2b",
				emissive: c,
				emissiveIntensity: 0.1,
				roughness: 0.55,
				transparent: true,
				opacity: 0.92,
			});
		const mkMuscles = (side: 1 | -1, c: string) =>
			[-0.12, 0, 0.12].map((dx, i) => {
				const len = 1.25 - i * 0.14;
				const m = new THREE.Mesh(
					new THREE.CapsuleGeometry(0.058 - i * 0.004, len, 6, 14),
					muscleMat(c),
				);
				m.scale.set(1, 1, 0.8);
				m.position.set(
					dx * 1.05,
					-0.95 - i * 0.06,
					side * (0.13 - Math.abs(dx) * 0.2),
				);
				m.rotation.z = dx * 0.35;
				scene.add(m);
				return m;
			});
		const flexors = mkMuscles(1, "#ff4d5e");
		const extensors = mkMuscles(-1, "#ff9a4d");
		// tendons running into the hand
		for (const [x, side] of [
			[-0.14, 1],
			[0, 1],
			[0.14, 1],
			[-0.14, -1],
			[0.14, -1],
		] as const) {
			const t = new THREE.Mesh(
				new THREE.CylinderGeometry(0.012, 0.012, 0.45, 6),
				new THREE.MeshStandardMaterial({
					color: "#e9dcc8",
					emissive: "#3a3326",
					roughness: 0.6,
				}),
			);
			t.position.set(x, -0.05, side * 0.1);
			scene.add(t);
		}
		const band = new THREE.Mesh(
			new THREE.TorusGeometry(0.33, 0.075, 14, 40),
			new THREE.MeshStandardMaterial({
				color: "#10151f",
				emissive: "#2563eb",
				emissiveIntensity: 0.5,
				roughness: 0.4,
			}),
		);
		band.rotation.x = Math.PI / 2;
		band.position.y = -0.38;
		scene.add(band);
		const ledMat = new THREE.MeshBasicMaterial({ color: "#3b9bff" });
		const led = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), ledMat);
		led.position.set(0, -0.38, 0.4);
		scene.add(led);

		// hand (pivots at the wrist)
		const hand = new THREE.Group();
		scene.add(hand);
		const palm = new THREE.Mesh(
			new THREE.SphereGeometry(1, 28, 20),
			new THREE.MeshStandardMaterial({
				color: "#2b6cc4",
				emissive: "#0a2a5e",
				emissiveIntensity: 0.8,
				transparent: true,
				opacity: 0.28,
				roughness: 0.5,
			}),
		);
		palm.scale.set(0.5, 0.52, 0.11);
		palm.position.y = 0.5;
		hand.add(palm);
		const link = (from: THREE.Vector3, to: THREE.Vector3, r: number) => {
			const d = to.clone().sub(from);
			const m = new THREE.Mesh(
				new THREE.CapsuleGeometry(r, d.length(), 6, 12),
				BONE,
			);
			m.position.copy(from.clone().add(to).multiplyScalar(0.5));
			m.quaternion.setFromUnitVectors(
				new THREE.Vector3(0, 1, 0),
				d.normalize(),
			);
			hand.add(m);
		};
		const wrist = new THREE.Vector3(0, 0, 0);
		for (const f of FINGERS) link(wrist, new THREE.Vector3(f.x, 1.0, 0), 0.04);
		link(wrist, new THREE.Vector3(0.5, 0.22, 0.02), 0.05);
		const wj = joint(0.13);
		hand.add(wj);

		const fingers = FINGERS.map((f) => {
			const c = chain(f.len, f.r, f.curl);
			c.root.position.set(f.x, 1.0, 0);
			hand.add(c.root);
			return c;
		});
		const thumb = chain([0.32, 0.26], 0.085, [0.1, 0.25]);
		const thumbBase = new THREE.Group();
		thumbBase.position.set(0.5, 0.22, 0.02);
		thumbBase.rotation.z = -0.95;
		thumbBase.add(thumb.root);
		hand.add(thumbBase);

		// fingertip trails (index + thumb)
		const TRAIL = 46;
		const mkTrail = (color: string) => {
			const geo = new THREE.BufferGeometry();
			geo.setAttribute(
				"position",
				new THREE.BufferAttribute(new Float32Array(TRAIL * 3), 3),
			);
			geo.setAttribute(
				"color",
				new THREE.BufferAttribute(new Float32Array(TRAIL * 3), 3),
			);
			const line = new THREE.Line(
				geo,
				new THREE.LineBasicMaterial({ vertexColors: true, transparent: true }),
			);
			line.frustumCulled = false;
			scene.add(line);
			return { geo, base: new THREE.Color(color), pts: [] as THREE.Vector3[] };
		};
		const trails = [
			{ tip: fingers[0].tip, ...mkTrail("#5aa2ff") },
			{ tip: thumb.tip, ...mkTrail("#ff9a4d") },
		];

		// acceleration arrow at the wrist
		const arrow = new THREE.ArrowHelper(
			new THREE.Vector3(1, 0, 0),
			new THREE.Vector3(0, 0, 0),
			0.01,
			"#ff9a4d",
			0.12,
			0.08,
		);
		scene.add(arrow);

		const resize = () => {
			const w = el.clientWidth;
			const h = el.clientHeight;
			renderer.setSize(w, h);
			camera.aspect = w / h;
			camera.updateProjectionMatrix();
		};
		const ro = new ResizeObserver(resize);
		ro.observe(el);
		resize();

		const tmp = new THREE.Vector3();
		let raf = 0;
		const loop = () => {
			const p = pose.current;
			if (p) {
				hand.rotation.x = (p.tilt * Math.PI) / 180;
				hand.rotation.y = (p.roll * Math.PI) / 180;
				fingers[0].joints[0].rotation.x = FINGERS[0].curl[0] + 0.35 * p.fingers;
				fingers[1].joints[0].rotation.x = FINGERS[1].curl[0] + 0.15 * p.fingers;
				thumbBase.rotation.z = -0.95 + 0.28 * p.fingers;
				const hot = Math.min(1, p.level);
				ledMat.color.set(
					hot > 0.55 ? "#ff3b30" : hot > 0.25 ? "#ffb020" : "#3b9bff",
				);
				const fl = Math.min(1, Math.max(0, p.flexor ?? 0));
				const ex = Math.min(1, Math.max(0, p.extensor ?? 0));
				for (const m of flexors) {
					const mm = m.material as THREE.MeshStandardMaterial;
					mm.emissiveIntensity = 0.1 + 2.2 * fl;
					m.scale.set(1 + 0.45 * fl, 1, 0.8 + 0.5 * fl);
				}
				for (const m of extensors) {
					const mm = m.material as THREE.MeshStandardMaterial;
					mm.emissiveIntensity = 0.1 + 2.2 * ex;
					m.scale.set(1 + 0.45 * ex, 1, 0.8 + 0.5 * ex);
				}
				const [ax, ay, az] = p.accel;
				const v = tmp.set(ax, az, ay);
				const len = v.length();
				if (len > 0.01) arrow.setDirection(v.normalize());
				arrow.setLength(Math.max(0.01, len * 3.2), 0.12, 0.08);
			}
			hand.updateMatrixWorld(true);
			for (const t of trails) {
				const w = new THREE.Vector3();
				t.tip.getWorldPosition(w);
				t.pts.push(w);
				if (t.pts.length > TRAIL) t.pts.shift();
				const pos = t.geo.getAttribute("position") as THREE.BufferAttribute;
				const col = t.geo.getAttribute("color") as THREE.BufferAttribute;
				t.pts.forEach((q, i) => {
					const f = i / (TRAIL - 1);
					pos.setXYZ(i, q.x, q.y, q.z);
					col.setXYZ(i, t.base.r * f, t.base.g * f, t.base.b * f);
				});
				for (let i = t.pts.length; i < TRAIL; i++) {
					const q = t.pts[0];
					pos.setXYZ(i, q.x, q.y, q.z);
					col.setXYZ(i, 0, 0, 0);
				}
				pos.needsUpdate = true;
				col.needsUpdate = true;
			}
			controls.update();
			renderer.render(scene, camera);
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);

		return () => {
			cancelAnimationFrame(raf);
			ro.disconnect();
			controls.dispose();
			scene.traverse((o) => {
				const m = o as THREE.Mesh;
				m.geometry?.dispose?.();
			});
			renderer.dispose();
			renderer.domElement.remove();
		};
	}, [pose]);

	return (
		<div
			ref={host}
			className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
			role="img"
			aria-label="3D hand rebuilt from the wrist motion. Drag to rotate."
		/>
	);
}
