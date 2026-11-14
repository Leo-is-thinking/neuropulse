import { clinicalStore } from "@/lib/clinicalStore";
import type { ActuationResult } from "@/types/clinical";
import { buildRecommendations } from "../analyze/fallback";
import { sendToWrist, synthesizeVoice } from "./dispatch";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
	const b = (await req.json().catch(() => null)) as {
		patientId?: string;
		recommendationIds?: string[];
	} | null;
	if (!b?.patientId)
		return Response.json({ error: "patientId_required" }, { status: 400 });
	const patient = clinicalStore.get(b.patientId);
	if (!patient)
		return Response.json({ error: "patient_not_found" }, { status: 404 });

	const all = buildRecommendations(patient);
	const chosen = b.recommendationIds?.length
		? all.filter((r) => b.recommendationIds!.includes(r.id))
		: all;
	if (!chosen.length)
		return Response.json(
			{ error: "no_matching_recommendations", available: all.map((r) => r.id) },
			{ status: 400 },
		);

	const applied = clinicalStore.applyRecommendations(patient.id, chosen);
	if ("error" in applied) return Response.json(applied, { status: 400 });

	const { voice, audioBase64 } = await synthesizeVoice(
		applied.command.voiceText,
	);
	const vexo = await sendToWrist(applied.command, audioBase64);
	clinicalStore.logWrist(patient.id, {
		at: new Date().toISOString(),
		command: applied.command,
		delivered: vexo.delivered,
		simulated: vexo.simulated,
	});

	const result: ActuationResult = {
		prescription: applied.prescription,
		command: applied.command,
		vexo,
		voice,
	};
	return Response.json(result);
}
