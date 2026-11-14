// T2 — browser-side helpers for the live band / simulated events. Pure TS, no deps.
import type {
	DataSourceState,
	LiveEventInput,
	LiveFeed,
	LiveSource,
} from "@/types/clinical";

export type PostResult =
	| { ok: true; data: unknown }
	| { ok: false; error: "live_disabled" | "network" | string; status: number };

type LiveEvt = Omit<LiveEventInput, "patientId" | "source">;

/** POST /api/live-event. 409 live_disabled is returned as a value, never thrown. */
export async function postLiveEvent(
	patientId: string,
	evt: LiveEvt,
	source: LiveSource = "band",
): Promise<PostResult> {
	try {
		const res = await fetch("/api/live-event", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ ...evt, patientId, source }),
		});
		const data = (await res.json().catch(() => ({}))) as { error?: string };
		if (!res.ok)
			return {
				ok: false,
				error: data.error ?? `http_${res.status}`,
				status: res.status,
			};
		return { ok: true, data };
	} catch {
		return { ok: false, error: "network", status: 0 };
	}
}

/** Backup demo trigger: tremor 5.3 Hz + glass break + HR 96, all tagged source "sim". Stops at first failure. */
export async function simulateTremorGlassBreak(
	patientId: string,
): Promise<PostResult> {
	const events: LiveEvt[] = [
		{ type: "tremor", value: 5.3, amplitude: 0.12 },
		{ type: "acoustic", tag: "Object_Drop_Glass_Break" },
		{ type: "heart_rate", value: 96 },
	];
	let last: PostResult = { ok: true, data: null };
	for (const e of events) {
		last = await postLiveEvent(patientId, e, "sim");
		if (!last.ok) return last;
	}
	return last;
}

export async function getLiveFeed(patientId: string): Promise<LiveFeed | null> {
	try {
		const res = await fetch(
			`/api/live-feed?patientId=${encodeURIComponent(patientId)}`,
			{ cache: "no-store" },
		);
		return res.ok ? ((await res.json()) as LiveFeed) : null;
	} catch {
		return null;
	}
}

export async function getDataSource(): Promise<DataSourceState | null> {
	try {
		const res = await fetch("/api/data-source", { cache: "no-store" });
		return res.ok ? ((await res.json()) as DataSourceState) : null;
	} catch {
		return null;
	}
}
