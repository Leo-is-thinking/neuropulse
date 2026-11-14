import { episodeStore } from "@/lib/episodeStore";

export const dynamic = "force-dynamic";

/** GET /api/tremor-episodes?patientId=armel -> TremorEpisode[] (newest last). DELETE clears them. */
export async function GET(req: Request) {
	const id = new URL(req.url).searchParams.get("patientId") ?? "armel";
	return Response.json(episodeStore.list(id));
}

export async function DELETE(req: Request) {
	const id = new URL(req.url).searchParams.get("patientId") ?? "armel";
	episodeStore.clear(id);
	return Response.json({ cleared: true });
}
