// Plain-language comments written from the measured band data, like the synthesis shown for Henri.
import type { TremorEpisode, VoiceEpisode } from "@/types/clinical";

const NORMAL_WPM = 130;

export function tremorComments(
	e: TremorEpisode,
	posture?: { posture: string; why: string },
): string[] {
	const dur = Math.max(
		1,
		Math.round((Date.parse(e.end) - Date.parse(e.start)) / 1000),
	);
	const out = [
		`**${e.hz.toFixed(1)} Hz** (${e.hz_min.toFixed(1)}–${e.hz_max.toFixed(1)}) for **${dur} s**, ${e.kind}. ${
			e.hz >= 4 && e.hz <= 6.2
				? "This is the typical Parkinsonian rest-tremor band."
				: e.hz > 6.2
					? "Faster than rest tremor: closer to postural or action tremor."
					: "Slower than rest tremor."
		}`,
		`Amplitude **${e.amp.toFixed(2)} g** on average, peak **${e.amp_peak.toFixed(2)} g**. ${
			e.amp_peak >= 0.3
				? "Strong episode."
				: e.amp_peak >= 0.1
					? "Moderate episode."
					: "Mild episode."
		}`,
		`Wrist pitch **${e.pitch}°**, roll **${e.roll}°**, measured from gravity.`,
	];
	if (posture)
		out.push(`Body: **${posture.posture.replace("_", " ")}**. ${posture.why}.`);
	if (e.activity === "walk" || e.activity === "run")
		out.push("The band counted steps during this episode.");
	else
		out.push(
			"No steps during the episode, so it is not walking. Scratching the head or reaching rotates the forearm and is filtered out, not counted as tremor.",
		);
	return out;
}

export function voiceComments(eps: VoiceEpisode[]): string[] {
	if (eps.length === 0) return [];
	const slow = eps.reduce((b, e) => (e.wpm < b.wpm ? e : b), eps[0]);
	const fast = eps.reduce((b, e) => (e.wpm > b.wpm ? e : b), eps[0]);
	const out = [
		`**${eps.length}** phrases recorded, **${eps.filter((e) => e.slow).length}** under 100 words/min (slow speech).`,
	];
	if (eps.length > 1 && slow.id !== fast.id) {
		out.push(
			`Fastest **${fast.wpm}** words/min, slowest **${slow.wpm}** words/min: **${(fast.wpm / slow.wpm).toFixed(1)}×** slower, **${Math.round((1 - slow.wpm / fast.wpm) * 100)}%** drop.`,
		);
		if (typeof slow.db_avg === "number" && typeof fast.db_avg === "number") {
			const d = slow.db_avg - fast.db_avg;
			out.push(
				`Volume (band mic, relative): **${fast.db_avg} dB** in the fast phrase, **${slow.db_avg} dB** in the slow one (${d >= 0 ? "+" : ""}${d.toFixed(1)} dB). ${
					d <= -3
						? "Quieter as well as slower: bradylalia with reduced volume (hypophonia) is a Parkinson sign."
						: "Volume held while the rate dropped."
				}`,
			);
		}
	}
	out.push(
		`Reference: typical adult conversation is about **${NORMAL_WPM}** words/min. Rate is words divided by seconds actually spoken, so pauses and noise do not count as slow speech.`,
	);
	return out;
}
