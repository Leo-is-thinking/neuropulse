import { bandStatus } from "@/lib/bandStatus";

export const dynamic = "force-dynamic";

/** GET /api/band-status?patientId=armel -> { state, source, lastSeen } */
export async function GET(req: Request) {
	const id = new URL(req.url).searchParams.get("patientId") ?? "armel";
	return Response.json(bandStatus.get(id));
}
