import type { Analysis, Finding, Patient } from "@/types/clinical";

/**
 * Refines the deterministic analysis with Gemini. Facts (confidence, links, rejections,
 * recommendations) stay grounded in the deterministic result; Gemini only rewrites
 * summary + findings in clinician-friendly English. Returns null on any failure.
 */
export async function refineWithGemini(
	p: Patient,
	draft: Analysis,
	apiKey: string,
): Promise<Analysis | null> {
	const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
	const validRefs = new Set(p.cells.map((c) => c.id));
	const prompt = [
		"You are a clinical assistant for a neurologist managing Parkinson's disease. Write in plain English.",
		"Rewrite the findings below. Keep every number exact. Do not add facts. Keep each cellRefs array as given (you may only use ids from it).",
		'Return JSON: {"summary": string, "findings": [{"text": string, "cellRefs": string[]}]}',
		`Patient: ${p.name}, ${p.age}`,
		`Confidence: ${Math.round(draft.confidence * 100)}%`,
		`Draft: ${JSON.stringify({ summary: draft.summary, findings: draft.findings })}`,
	].join("\n");

	try {
		const res = await fetch(
			`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-goog-api-key": apiKey,
				},
				body: JSON.stringify({
					contents: [{ parts: [{ text: prompt }] }],
					generationConfig: {
						responseMimeType: "application/json",
						temperature: 0.2,
					},
				}),
				signal: AbortSignal.timeout(8000),
			},
		);
		if (!res.ok) return null;
		const data = await res.json();
		const text: string | undefined =
			data?.candidates?.[0]?.content?.parts?.[0]?.text;
		if (!text) return null;
		const parsed = JSON.parse(text) as {
			summary?: unknown;
			findings?: unknown;
		};
		if (typeof parsed.summary !== "string" || !Array.isArray(parsed.findings))
			return null;
		const findings: Finding[] = [];
		for (const f of parsed.findings) {
			if (!f || typeof f.text !== "string" || !Array.isArray(f.cellRefs))
				return null;
			findings.push({
				text: f.text,
				cellRefs: f.cellRefs.filter(
					(r: unknown): r is string =>
						typeof r === "string" && validRefs.has(r),
				),
			});
		}
		if (!findings.length) return null;
		return { ...draft, summary: parsed.summary, findings, source: "gemini" };
	} catch {
		return null;
	}
}
