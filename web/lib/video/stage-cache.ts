import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function digest(value: string | Buffer): string { return createHash("sha256").update(value).digest("hex"); }
export function objectDigest(value: unknown): string { return digest(JSON.stringify(value)); }

/** Fingerprint actual implementations so a forgotten version bump cannot reuse obsolete output. */
export function implementationDigest(files: string[]): string {
  const directory = path.dirname(fileURLToPath(import.meta.url));
  return objectDigest(files.map((file) => ({ file, digest: digest(readFileSync(path.resolve(directory, file))) })));
}

export function writeJson(filename: string, value: unknown): void {
  mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(value, null, 2));
  renameSync(temporary, filename);
}

/** Content checksum catches partial writes and accidental cache edits. */
export function readStage<T>(root: string, stage: string, key: string): T | null {
  const filename = path.join(root, stage, `${key}.json`);
  if (!existsSync(filename)) return null;
  try {
    const record = JSON.parse(readFileSync(filename, "utf8"));
    if (record.key !== key || record.sha256 !== objectDigest(record.value)) return null;
    return record.value as T;
  } catch { return null; }
}

export function saveStage(root: string, stage: string, key: string, value: unknown): void {
  writeJson(path.join(root, stage, `${key}.json`), { key, sha256: objectDigest(value), value });
}

export function audioCachePath(root: string, key: string): string { return path.join(root, "audio", `${key}.wav`); }
