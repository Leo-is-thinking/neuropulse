import { bandStatus } from "@/lib/bandStatus";
import { clinicalStore } from "@/lib/clinicalStore";
import { episodeStore } from "@/lib/episodeStore";
import { voiceStore } from "@/lib/voiceStore";
import type {
	LiveEventInput,
	LiveEventType,
	VoiceEpisode,
} from "@/types/clinical";

export const dynamic = "force-dynamic";

const TYPES = [
	"tremor",
	"heart_rate",
	"voice",
	"acoustic",
	"fall",
	"sample",
	"adherence",
	"tremor_episode",
	"band_status",
	"voice_episode",
] as unknown as LiveEventType[];

export async function POST(req: Request) {
	const b = (await req
		.json()
		.catch(() => null)) as Partial<LiveEventInput> | null;
	if (
		!b ||
		typeof b.patientId !== "string" ||
		!b.type ||
		!TYPES.includes(b.type)
	) {
		return Response.json(
			{ error: "invalid_body", expected: { patientId: "string", type: TYPES } },
			{ status: 400 },
		);
	}
	if (b.source !== undefined && b.source !== "band" && b.source !== "sim") {
		return Response.json(
			{ error: "invalid_source", expected: ["band", "sim"] },
			{ status: 400 },
		);
	}
	if ((b.type as string) === "band_status") {
		const st = (b as { state?: string }).state;
		if (st !== "connected" && st !== "disconnected")
			return Response.json({ error: "state_required" }, { status: 400 });
		bandStatus.set(b.patientId, st, b.source === "sim" ? "sim" : "band");
		return Response.json({ ok: true });
	}
	if ((b.type as string) === "tremor_episode") {
		const e = b.episode;
		if (!e || typeof e.hz !== "number" || typeof e.start !== "string")
			return Response.json({ error: "episode_required" }, { status: 400 });
		if (clinicalStore.feed(b.patientId) === undefined)
			return Response.json({ error: "patient_not_found" }, { status: 404 });
		episodeStore.add(b.patientId, e);
		return Response.json({ ok: true });
	}
	if ((b.type as string) === "voice_episode") {
		const e = (b as unknown as { episode?: VoiceEpisode & { ogg?: string } })
			.episode;
		if (!e || typeof e.wpm !== "number" || typeof e.start !== "string")
			return Response.json({ error: "episode_required" }, { status: 400 });
		if (clinicalStore.feed(b.patientId) === undefined)
			return Response.json({ error: "patient_not_found" }, { status: 404 });
		voiceStore.add(b.patientId, e);
		return Response.json({ ok: true });
	}
	const r = clinicalStore.pushLive(b as LiveEventInput);
	if ("error" in r)
		return Response.json(r, {
			status:
				r.error === "patient_not_found"
					? 404
					: r.error === "live_disabled"
						? 409
						: 400,
		});
	return Response.json(r);
}
