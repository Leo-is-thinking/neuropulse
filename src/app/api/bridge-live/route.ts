export const dynamic = "force-dynamic";

/** POST /api/bridge-live {on:boolean} -> bridge live data ON/OFF (same as the band double-tap). Bridge off = ignored. */
export async function POST(req: Request) {
	const b = (await req.json().catch(() => null)) as { on?: boolean } | null;
	try {
		await fetch("http://127.0.0.1:8765/live", {
			method: "POST",
			body: JSON.stringify({ on: !!b?.on }),
			signal: AbortSignal.timeout(3000),
		});
		return Response.json({ ok: true });
	} catch {
		return Response.json({ ok: false, bridge: "offline" });
	}
}
