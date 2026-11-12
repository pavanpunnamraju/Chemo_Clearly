/** Explicit, repeatable setup; production alignment never silently installs tools. */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { alignmentWebRoot } from "./forced-align";

const cache = path.join(alignmentWebRoot, ".video-cache");
const environment = path.join(cache, "alignment-venv");
const python = path.join(environment, "bin/python");
const env = { ...process.env, UV_CACHE_DIR: path.join(cache, "uv-cache") };
function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd: alignmentWebRoot, env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
  });
}
if (!existsSync(python)) await run("uv", ["venv", environment, "--python", "3.11"]);
await run("uv", ["pip", "install", "--python", python, "-r", path.join(alignmentWebRoot, "lib/video/alignment-requirements.txt")]);
await run(python, [path.join(alignmentWebRoot, "lib/video/forced-align.py"), "--download-model", "--model-directory", path.join(cache, "torch")]);
console.log("Local acoustic alignment ready. Narration and audio stay local during alignment.");
