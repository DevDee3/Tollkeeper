import { existsSync, readFileSync } from "node:fs";

/** Reads KEY=value lines from a .env file. Missing file is fine. Real environment variables win. */
export function loadEnvFile(path: string, into: Record<string, string | undefined> = process.env): void {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    if (into[key] === undefined) into[key] = value;
  }
}
