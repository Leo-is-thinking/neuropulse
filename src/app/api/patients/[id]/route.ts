import { clinicalStore } from "@/lib/clinicalStore";

export const dynamic = "force-dynamic";

export async function GET(
	_req: Request,
	ctx: { params: Promise<{ id: string }> },
) {
	const { id } = await ctx.params;
	const patient = clinicalStore.get(id);
	if (!patient)
		return Response.json({ error: "patient_not_found" }, { status: 404 });
	return Response.json(patient);
}
