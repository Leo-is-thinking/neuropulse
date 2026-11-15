// Live link state of the Vexo band per patient. The bridge sends a heartbeat every 2 s and an explicit
// "disconnected" when stopped (double-tap / Ctrl+C); no heartbeat for STALE_MS also counts as disconnected.
export type BandLink = "connected" | "disconnected";
export interface BandStatus {
	state: BandLink;
	source: "band" | "sim";
	/** epoch ms of the last signal from the bridge, null = never seen */
	lastSeen: number | null;
}

const STALE_MS = 8000;
const g = globalThis as unknown as {
	__bandStatus?: Map<
		string,
		{ state: BandLink; source: "band" | "sim"; t: number }
	>;
};
const db = () => {
	if (!g.__bandStatus) g.__bandStatus = new Map();
	return g.__bandStatus;
};

export const bandStatus = {
	set(patientId: string, state: BandLink, source: "band" | "sim" = "band") {
		db().set(patientId, { state, source, t: Date.now() });
	},
	get(patientId: string): BandStatus {
		const s = db().get(patientId);
		if (!s) return { state: "disconnected", source: "band", lastSeen: null };
		const alive = s.state === "connected" && Date.now() - s.t < STALE_MS;
		return {
			state: alive ? "connected" : "disconnected",
			source: s.source,
			lastSeen: s.t,
		};
	},
};
