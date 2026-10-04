import * as fs from "fs";
import * as path from "path";
import { config } from "../config.js";

// Full .osz archives (audio included), proxied from nerinyan and cached
// locally. The per-diff /v1/get-osu endpoint only serves bare .osu files,
// which resolves lobby display but isn't playable.
function localOszPath(setId: number): string {
  return path.join(config.beatmapsPath, "..", "osz", `${setId}.osz`);
}

function isZip(data: Buffer): boolean {
  return data.length > 4 && data[0] === 0x50 && data[1] === 0x4b;
}

async function fetchFromNerinyan(setId: number): Promise<Buffer | null> {
  // nerinyan rate-limits bursts and occasionally serves cloudflare
  // challenges. retry with exponential backoff so a burst of first-time
  // downloads (e.g. pre-warming a tournament pool) still lands.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(`https://api.nerinyan.moe/d/${setId}`, { redirect: "follow" });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (!isZip(buf)) continue;
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
  return fetchFromNerinyan(setId);
}
