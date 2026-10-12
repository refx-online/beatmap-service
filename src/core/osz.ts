import * as fs from "fs";
import * as path from "path";
import { config } from "../config.js";

// Full .osz archives (audio included), proxied from mirrors and cached
// locally. The per-diff /v1/get-osu endpoint only serves bare .osu files,
// which resolves lobby display but isn't playable.
//
// nerinyan is first because it is the fastest, but it only hosts a fraction
// of the catalogue and rate-limits bursts -- hence its retry budget. The rest
// are last resorts; osu.ppy.sh is the authority of last call. Every response
// is magic-byte checked, so a mirror answering with an error page or a
// captive-portal interstitial just counts as a miss.
const OSZ_MIRRORS: { url: string; attempts: number }[] = [
  { url: "https://api.nerinyan.moe/d/", attempts: 5 },
  { url: "https://osu.direct/d/", attempts: 1 },
  { url: "https://catboy.best/d/", attempts: 1 },
  { url: "https://osu.ppy.sh/d/", attempts: 1 },
];

function localOszPath(setId: number): string {
  return path.join(config.beatmapsPath, "..", "osz", `${setId}.osz`);
}

function isZip(data: Buffer): boolean {
  return data.length > 4 && data[0] === 0x50 && data[1] === 0x4b;
}

async function fetchOne(url: string, attempts: number, setId: number): Promise<Buffer | null> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await fetch(`${url}${setId}`, { redirect: "follow" });
      if (!res.ok) break;
      const buf = Buffer.from(await res.arrayBuffer());
      if (!isZip(buf)) break;
      try {
        fs.mkdirSync(path.dirname(localOszPath(setId)), { recursive: true });
        fs.writeFileSync(localOszPath(setId), buf);
      } catch {
        // cache is best-effort; still serve the download
      }
      return buf;
    } catch {
      // next attempt
    }
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
  }
  return null;
}

export async function getOszFile(setId: number): Promise<Buffer | null> {
  const filePath = localOszPath(setId);
  if (fs.existsSync(filePath)) {
    try {
      const data = fs.readFileSync(filePath);
      if (isZip(data)) return data;
      fs.rmSync(filePath, { force: true });
    } catch {
      // fall through to refetch
    }
  }
  for (const mirror of OSZ_MIRRORS) {
    const buf = await fetchOne(mirror.url, mirror.attempts, setId);
    if (buf) return buf;
  }
  return null;
}
