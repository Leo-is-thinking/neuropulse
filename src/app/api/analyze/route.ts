import { clinicalStore } from "@/lib/clinicalStore";
import { analyzeDeterministic } from "./fallback";
import { refineWithGemini } from "./gemini";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
	const body = (await req.json().catch(() => null)) as {
		patientId?: string;
	} | null;
	if (!body?.patientId)
		return Response.json({ error: "patientId_required" }, { status: 400 });
	const patient = clinicalStore.get(body.patientId);
	if (!patient)
		return Response.json({ error: "patient_not_found" }, { status: 404 });

	const draft = analyzeDeterministic(patient);
	const key = process.env.GEMINI_API_KEY;
	if (key) {
		const refined = await refineWithGemini(patient, draft, key);
		if (refined) return Response.json(refined);
	}
	return Response.json(draft);
}
