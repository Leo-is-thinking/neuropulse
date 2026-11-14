import { clinicalStore } from "@/lib/clinicalStore";

export const dynamic = "force-dynamic";

/** Current data source state: loaded 7-day dataset + Live intake counters. */
export async function GET() {
	return Response.json(clinicalStore.source());
}

/**
 * Control the two independent inputs.
 *  load_demo  → reload Henri 7-day demo/backup dataset (also clears Live)
 *  clear_live → wipe only the Live column (needs patientId)
 *  live_on / live_off → accept or pause band events
 */
export async function POST(req: Request) {
	const b = (await req.json().catch(() => null)) as {
		action?: string;
		patientId?: string;
	} | null;
	switch (b?.action) {
		case "load_demo":
			clinicalStore.reset();
			return Response.json(clinicalStore.source());
		case "clear_live": {
			if (!b.patientId)
				return Response.json({ error: "patientId_required" }, { status: 400 });
			const r = clinicalStore.clearLive(b.patientId);
			return "error" in r
				? Response.json(r, { status: 404 })
				: Response.json({ ...r, source: clinicalStore.source() });
		}
		case "live_on":
		case "live_off":
			return Response.json(clinicalStore.setLive(b.action === "live_on"));
		default:
			return Response.json(
				{
					error: "invalid_action",
					expected: ["load_demo", "clear_live", "live_on", "live_off"],
				},
				{ status: 400 },
			);
	}
}
