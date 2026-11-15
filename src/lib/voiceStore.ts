// Speech phrases recorded live from the band (rate + transcript + Ogg-Opus audio), kept per patient on disk.
import fs from "node:fs";
import path from "node:path";
import type { VoiceEpisode } from "@/types/clinical";

const DIR = path.join(process.cwd(), ".data", "voice");
const META = path.join(DIR, "episodes.json");
const KEEP = 60;
const g = globalThis as unknown as { __voice?: Map<string, VoiceEpisode[]> };

function db(): Map<string, VoiceEpisode[]> {
	if (!g.__voice) {
		g.__voice = new Map();
		try {
			const raw = JSON.parse(fs.readFileSync(META, "utf8")) as Record<
				string,
				VoiceEpisode[]
			>;
			for (const [k, v] of Object.entries(raw)) g.__voice.set(k, v);
		} catch {
			/* first run */
		}
	}
	return g.__voice;
}

const clipFile = (id: string) => path.join(DIR, `${id}.ogg`);

function save() {
	try {
		fs.mkdirSync(DIR, { recursive: true });
		fs.writeFileSync(META, JSON.stringify(Object.fromEntries(db())));
	} catch {
		/* keep in memory */
	}
}

export const voiceStore = {
	list: (patientId: string): VoiceEpisode[] => db().get(patientId) ?? [],
	add(patientId: string, ep: VoiceEpisode & { ogg?: string | null }) {
		const l = db().get(patientId) ?? [];
		const id = `${patientId}.v${Date.now()}-${l.length}`;
		const { ogg, ...meta } = ep;
		let hasAudio = false;
		if (ogg) {
			try {
				fs.mkdirSync(DIR, { recursive: true });
				fs.writeFileSync(clipFile(id), Buffer.from(ogg, "base64"));
				hasAudio = true;
			} catch {
				/* no audio */
			}
		}
		l.push({ ...meta, id, hasAudio });
		// keep the slowest phrases first, then the newest: a slow moment is what we look for
		while (l.length > KEEP) {
			const victim = l
				.slice(0, -10)
				.reduce((b, e, i, a) => (e.wpm > a[b].wpm ? i : b), 0);
			const [gone] = l.splice(victim, 1);
			try {
				fs.unlinkSync(clipFile(gone.id as string));
			} catch {
				/* already gone */
			}
		}
		db().set(patientId, l);
		save();
	},
	clip(id: string): Buffer | null {
		if (!/^[\w.-]+$/.test(id)) return null;
		try {
			return fs.readFileSync(clipFile(id));
		} catch {
			return null;
		}
	},
	clear(patientId: string) {
		for (const e of db().get(patientId) ?? []) {
			try {
				fs.unlinkSync(clipFile(e.id as string));
			} catch {
				/* none */
			}
		}
		db().delete(patientId);
		save();
	},
};
