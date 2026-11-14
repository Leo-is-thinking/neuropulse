import { clinicalStore } from "@/lib/clinicalStore";

export const dynamic = "force-dynamic";

/** Demo helper: restore seed data. */
export async function POST() {
	clinicalStore.reset();
	return Response.json({ ok: true });
}
