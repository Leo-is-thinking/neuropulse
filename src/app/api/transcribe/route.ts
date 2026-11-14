export const dynamic = "force-dynamic";

/** POST raw audio -> Deepgram prerecorded STT. Returns transcript + word timings. Key stays server-side. */
export async function POST(req: Request) {
	const key = process.env.DEEPGRAM_API_KEY;
	if (!key) return Response.json({ error: "no_deepgram_key" }, { status: 500 });
	const audio = await req.arrayBuffer();
	if (audio.byteLength < 1000)
		return Response.json({ error: "audio_too_short" }, { status: 400 });
	const r = await fetch(
		"https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&detect_language=true",
		{
			method: "POST",
			headers: {
				Authorization: `Token ${key}`,
				"Content-Type": req.headers.get("content-type") ?? "audio/webm",
			},
			body: audio,
		},
	);
	if (!r.ok)
		return Response.json({ error: `deepgram_${r.status}` }, { status: 502 });
	const j = await r.json();
	const alt = j?.results?.channels?.[0]?.alternatives?.[0];
	return Response.json({
		transcript: alt?.transcript ?? "",
		words: (alt?.words ?? []).map((w: { start: number; end: number }) => ({
			start: w.start,
			end: w.end,
		})),
		language: j?.results?.channels?.[0]?.detected_language ?? null,
	});
}
