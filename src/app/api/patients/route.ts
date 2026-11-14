import { clinicalStore } from "@/lib/clinicalStore";

export const dynamic = "force-dynamic";

export async function GET() {
	return Response.json(clinicalStore.list());
}
