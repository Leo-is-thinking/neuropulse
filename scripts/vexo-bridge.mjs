#!/usr/bin/env node
// Launches the Python Vexo bridge. Usage: node scripts/vexo-bridge.mjs [bridge.py args]
// No band number / --sim given -> defaults to --sim.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let args = process.argv.slice(2);
const hasBand = args.some((a) => /^\d+$/.test(a));
if (!hasBand && !args.includes("--sim")) args = ["--sim", ...args];
const pi = args.indexOf("--port");
const port = pi >= 0 && args[pi + 1] ? args[pi + 1] : "8765";

console.log(`[vexo-bridge] python3 bridge/bridge.py ${args.join(" ")}`);
console.log(`[vexo-bridge] set in .env.local: VEXO_WEBHOOK_URL=http://127.0.0.1:${port}/actuate`);

const child = spawn("python3", [path.join(root, "bridge", "bridge.py"), ...args], { cwd: root, stdio: "inherit" });
child.on("error", (e) => { console.error("[vexo-bridge] cannot start python3:", e.message); process.exit(1); });
child.on("exit", (code) => process.exit(code ?? 0));
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => child.kill(s));
