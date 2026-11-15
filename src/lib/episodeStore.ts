// Tremor episodes recorded from the live band, kept per patient and saved to disk so a restart keeps them.
import fs from "node:fs";
import path from "node:path";
import type { TremorEpisode } from "@/types/clinical";

const FILE = path.join(process.cwd(), ".data", "tremor-episodes.json");
const g = globalThis as unknown as {
	__episodes?: Map<string, TremorEpisode[]>;
};

function db(): Map<string, TremorEpisode[]> {
	if (!g.__episodes) {
		g.__episodes = new Map();
		try {
			const raw = JSON.parse(fs.readFileSync(FILE, "utf8")) as Record<
				string,
				TremorEpisode[]
			>;
			for (const [k, v] of Object.entries(raw)) g.__episodes.set(k, v);
		} catch {
			/* first run */
		}
	}
	return g.__episodes;
}

function save() {
	try {
		fs.mkdirSync(path.dirname(FILE), { recursive: true });
		fs.writeFileSync(FILE, JSON.stringify(Object.fromEntries(db())));
	} catch {
		/* keep in memory */
	}
}

export const episodeStore = {
	list(patientId: string): TremorEpisode[] {
		return db().get(patientId) ?? [];
	},
	add(patientId: string, ep: TremorEpisode) {
		const l = db().get(patientId) ?? [];
		l.push({ ...ep, id: `${patientId}.ep${Date.now()}-${l.length}` });
		const kept = l.slice(-60);
		// raw IMU is ~40 kB per episode: keep it on the newest 15 only so the file stays small
		for (let i = 0; i < kept.length - 15; i++)
			if (kept[i].imu) kept[i] = { ...kept[i], imu: null };
		db().set(patientId, kept);
		save();
	},
	clear(patientId: string) {
		db().delete(patientId);
		save();
	},
};
