import type { ActuationResult, WristCommand } from "@/types/clinical";

type Vexo = ActuationResult["vexo"];
type Voice = ActuationResult["voice"];

/** ElevenLabs TTS. Simulated unless ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID are set. */
export async function synthesizeVoice(
	text: string,
): Promise<{ voice: Voice; audioBase64?: string }> {
	const key = process.env.ELEVENLABS_API_KEY;
	const voiceId = process.env.ELEVENLABS_VOICE_ID;
	if (!key || !voiceId) {
		return {
			voice: {
				generated: false,
				simulated: true,
				detail: "ELEVENLABS_API_KEY/VOICE_ID not set — cue simulated.",
			},
		};
	}
	try {
		const res = await fetch(
			`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_64`,
			{
				method: "POST",
				headers: { "xi-api-key": key, "Content-Type": "application/json" },
				body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" }),
				signal: AbortSignal.timeout(10000),
			},
		);
		if (!res.ok)
			return {
				voice: {
					generated: false,
					simulated: false,
					detail: `ElevenLabs HTTP ${res.status}`,
				},
			};
		const buf = Buffer.from(await res.arrayBuffer());
		return {
			voice: {
				generated: true,
				simulated: false,
				detail: `${buf.length} bytes mp3`,
			},
			audioBase64: buf.toString("base64"),
		};
	} catch (e) {
		return {
			voice: {
				generated: false,
				simulated: false,
				detail: `ElevenLabs error: ${(e as Error).message}`,
			},
		};
	}
}

/**
 * Vexo wristband webhook. Simulated unless VEXO_WEBHOOK_URL is set.
 * Payload contract (adapt the receiving side):
 * { patientId, led:"amber", haptic:"double", voiceText, audioBase64?, arm:{doseId,dueAt,signals,confirmed} }
 */
export async function sendToWrist(
	command: WristCommand,
	audioBase64?: string,
): Promise<Vexo> {
	const url = process.env.VEXO_WEBHOOK_URL;
	if (!url)
		return {
			delivered: false,
			simulated: true,
			detail: "VEXO_WEBHOOK_URL not set — command simulated.",
		};
	try {
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};
		if (process.env.VEXO_WEBHOOK_TOKEN)
			headers.Authorization = `Bearer ${process.env.VEXO_WEBHOOK_TOKEN}`;
		const res = await fetch(url, {
			method: "POST",
			headers,
			body: JSON.stringify({ ...command, audioBase64 }),
			signal: AbortSignal.timeout(5000),
		});
		return {
			delivered: res.ok,
			simulated: false,
			detail: `Webhook HTTP ${res.status}`,
		};
	} catch (e) {
		return {
			delivered: false,
			simulated: false,
			detail: `Webhook error: ${(e as Error).message}`,
		};
	}
}
