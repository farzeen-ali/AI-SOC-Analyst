import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Minimal `.env.local` loader.
 *
 * Next injects these itself at runtime, but Playwright's own process does not
 * go through Next — the seeding step talks to Supabase directly and needs the
 * service role key. Written by hand rather than adding `dotenv`: this reads
 * one file in one format and keeps the dependency surface of a security
 * product smaller.
 *
 * Existing environment variables always win, so CI secrets are never
 * overwritten by a stray local file.
 */
export function loadEnvLocal(file = ".env.local"): void {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) return;

  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    if (!key || key in process.env) continue;

    let value = line.slice(eq + 1).trim();
    // Strip matching surrounding quotes, which .env files commonly carry.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is required to run the end-to-end suite. ` +
        `Copy .env.example to .env.local and fill it in.`
    );
  }
  return value;
}
