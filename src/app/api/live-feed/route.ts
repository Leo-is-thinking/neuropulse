import { clinicalStore } from "@/lib/clinicalStore";

export const dynamic = "force-dynamic";

/** GET /api/live-feed?patientId=henri-m -> LiveFeed (ring buffers, 120 samples/metric). */
export async function GET(req: Request) {
	const id = new URL(req.url).searchParams.get("patientId") ?? "henri-m";
	const feed = clinicalStore.feed(id);
	if (!feed)
		return Response.json({ error: "patient_not_found" }, { status: 404 });
	return Response.json(feed);
}
