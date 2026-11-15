// Patient reference photos, kept OUT of public/ (.data/patients/<id>/photos, git-ignored) and served only by this route.
// GET ?patientId=armel             -> [{ file, url }]
// GET ?patientId=armel&file=x.jpg  -> the image
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

const ROOT = path.join(process.cwd(), ".data", "patients");
const SAFE_ID = /^[a-z0-9-]{1,40}$/;
const SAFE_FILE = /^[a-z0-9-]{1,60}\.jpg$/;

export async function GET(req: Request) {
	const q = new URL(req.url).searchParams;
	const id = q.get("patientId") ?? "";
	if (!SAFE_ID.test(id))
		return Response.json({ error: "bad_patient" }, { status: 400 });
	const dir = path.join(ROOT, id, "photos");
	const file = q.get("file");
	if (file) {
		if (!SAFE_FILE.test(file))
			return Response.json({ error: "bad_file" }, { status: 400 });
		try {
			const buf = fs.readFileSync(path.join(dir, file));
			return new Response(new Uint8Array(buf), {
				headers: {
					"content-type": "image/jpeg",
					"cache-control": "private, max-age=3600",
				},
			});
		} catch {
			return Response.json({ error: "not_found" }, { status: 404 });
		}
	}
	let files: string[] = [];
	try {
		files = fs
			.readdirSync(dir)
			.filter((f) => SAFE_FILE.test(f))
			.sort();
	} catch {
		/* no photos */
	}
	return Response.json(
		files.map((f) => ({
			file: f,
			url: `/api/patient-photos?patientId=${id}&file=${f}`,
		})),
	);
}
