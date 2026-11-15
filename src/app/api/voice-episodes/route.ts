import { voiceStore } from "@/lib/voiceStore";

export const dynamic = "force-dynamic";

/** GET /api/voice-episodes?patientId=armel -> VoiceEpisode[] (newest last). GET ...&clip=<id> -> audio/ogg. DELETE clears. */
export async function GET(req: Request) {
	const q = new URL(req.url).searchParams;
	const clip = q.get("clip");
	if (clip) {
		const b = voiceStore.clip(clip);
		return b
			? new Response(new Uint8Array(b), {
					headers: { "Content-Type": "audio/ogg", "Cache-Control": "no-store" },
				})
			: Response.json({ error: "clip_not_found" }, { status: 404 });
	}
	return Response.json(voiceStore.list(q.get("patientId") ?? "armel"));
}

export async function DELETE(req: Request) {
	voiceStore.clear(new URL(req.url).searchParams.get("patientId") ?? "armel");
	return Response.json({ cleared: true });
}
