import { episodeStore } from "@/lib/episodeStore";

export const dynamic = "force-dynamic";

/**
 * GET /api/tremor-episodes?patientId=armel -> TremorEpisode[] (newest last), raw IMU left out (hasImu flag).
 * GET ...&id=<episode id> -> that one episode with its raw IMU, for the 3D replay. DELETE clears them.
 */
export async function GET(req: Request) {
	const q = new URL(req.url).searchParams;
	const list = episodeStore.list(q.get("patientId") ?? "armel");
	const one = q.get("id");
	if (one) {
		const e = list.find((x) => x.id === one);
		return e
			? Response.json(e)
			: Response.json({ error: "episode_not_found" }, { status: 404 });
	}
	return Response.json(
		list.map(({ imu, ...e }) => ({ ...e, hasImu: !!imu?.s?.length })),
	);
}

export async function DELETE(req: Request) {
	const id = new URL(req.url).searchParams.get("patientId") ?? "armel";
	episodeStore.clear(id);
	return Response.json({ cleared: true });
}
