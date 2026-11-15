export const dynamic = "force-dynamic";

/** POST /api/bridge-reset -> tells the local bridge to zero its day counters (steps, tremor). Bridge off = ignored. */
export async function POST() {
	try {
		await fetch("http://127.0.0.1:8765/reset", {
			method: "POST",
			body: "{}",
			signal: AbortSignal.timeout(2000),
		});
		return Response.json({ ok: true });
	} catch {
		return Response.json({ ok: false, bridge: "offline" });
	}
}
