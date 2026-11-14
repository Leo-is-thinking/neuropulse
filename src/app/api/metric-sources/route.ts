export const dynamic = "force-dynamic";

type Row = {
	stream: string;
	metric: string;
	source: "band" | "band-heuristic" | "simulated";
	sensor: string;
	algorithm: string;
	/** bridge flag needed, if any */
	needs?: string;
};

/** GET /api/metric-sources — which metric comes from the real band vs simulated data. */
const ROWS: Row[] = [
	{
		stream: "tremor",
		metric: "tremor_burden",
		source: "band",
		sensor: "Accelerometer",
		algorithm:
			"2 s FFT, 4–6 Hz peak, ≥35 % of band energy; % of awake windows (10 min)",
	},
	{
		stream: "tremor",
		metric: "tremor_intensity",
		source: "band",
		sensor: "Accelerometer",
		algorithm:
			"Peak amplitude of the 4–6 Hz tremor band (g); score = min(10, amplitude g × 20)",
	},
	{
		stream: "tremor",
		metric: "tremor_hz",
		source: "band",
		sensor: "Accelerometer",
		algorithm: "Dominant frequency 2–9 Hz (live feed)",
	},
	{
		stream: "tremor",
		metric: "dyskinesia_index",
		source: "band",
		sensor: "Accelerometer",
		algorithm:
			"Large, broadband, non-peaky motion; 10 × share of awake windows",
	},
	{
		stream: "balance",
		metric: "instability_events",
		source: "band",
		sensor: "Accelerometer",
		algorithm:
			"Free-fall dip → impact >2.5 g + stillness = fall; 1.6–2.5 g + movement = near-fall",
	},
	{
		stream: "sleep",
		metric: "nocturia",
		source: "band",
		sensor: "Activity (steps) + clock",
		algorithm: "23:00–06:00, ≥20 min still, then ≥8 steps in 90 s",
	},
	{
		stream: "mobility",
		metric: "steps",
		source: "band",
		sensor: "Band step counter",
		algorithm: "Lifetime counter minus first value of the session",
	},
	{
		stream: "mobility",
		metric: "outdoor_time",
		source: "band",
		sensor: "Bluetooth RSSI",
		algorithm:
			"RSSI ≤ −80 dBm for ≥60 s = away from laptop (Bluetooth link only, not USB)",
	},
	{
		stream: "voice",
		metric: "verbal_engagement",
		source: "band-heuristic",
		sensor: "Microphone loudness",
		algorithm: "Minutes with mic level ≥ 0.08",
		needs: "--mic (locks LED blue)",
	},
	{
		stream: "acoustic",
		metric: "acoustic_tags",
		source: "band-heuristic",
		sensor: "Microphone loudness",
		algorithm:
			"Impulsive peak + fast decay = glass; sustained variable babble = Crowd_Stress; double-tap = Pill_Water stand-in",
		needs: "--mic",
	},
	{
		stream: "adherence",
		metric: "verified_doses",
		source: "band",
		sensor: "Accelerometer + LED + tap",
		algorithm:
			"LED cue + hand-to-mouth gesture + water (double-tap) + tremor drop at +35 min",
	},
	{
		stream: "voice",
		metric: "speech_rate",
		source: "simulated",
		sensor: "none (needs speech-to-text)",
		algorithm: "Seed / simulated values only",
	},
	{
		stream: "cardiac",
		metric: "bpm_peak",
		source: "simulated",
		sensor: "none (no PPG on the band)",
		algorithm: "Seed / simulated values only",
	},
	{
		stream: "cardiac",
		metric: "hrv",
		source: "simulated",
		sensor: "none (no PPG on the band)",
		algorithm: "Seed / simulated values only",
	},
	{
		stream: "cardiac",
		metric: "extrasystoles",
		source: "simulated",
		sensor: "none (no PPG on the band)",
		algorithm: "Seed / simulated values only",
	},
];

export async function GET() {
	return Response.json(ROWS);
}
