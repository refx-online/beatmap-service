import * as beatmapRepo from "../repositories/beatmap.js";
import { getOsuFile } from "../core/beatmap.js";
import { config } from "../config.js";
import { MirrorsManager } from "../mirrors/manager.js";
import * as crypto from "crypto";
import * as fs from "fs/promises";
import * as path from "path";

interface BeatmapResponse {
  status: number;
  beatmap?: beatmapRepo.Beatmap;
  message?: string;
  /**
   * Explicitly marks the .osu as present and md5-verified. `status` alone cannot
   * express this: on success it carries the beatmap's osu-web approved status,
   * and 1 there means "ranked" -- which collided with the legacy "1|false"
   * md5-mismatch wire code and made every ranked map look unavailable.
   */
  available?: boolean;
}

async function calculateMd5(buffer: Buffer): Promise<string> {
  return crypto.createHash("md5").update(buffer).digest("hex");
}

function parseOsuApiResponse(data: any): beatmapRepo.Beatmap | null {
  if (!Array.isArray(data) || data.length === 0) return null;

  const map = data[0];
  const filename = `${map.artist} - ${map.title} (${map.creator}) [${map.version}].osu`;

  // osu approved int -> our RankedStatus, then mask it across all modes.
  // mirrors forlorn's parse_beatmap_from_api mapping.
  const approved = parseInt(map.approved, 10);
  const rankedStatus =
    approved <= 0 ? 0 : approved === 1 ? 2 : approved === 2 ? 3 : approved === 3 ? 4 : approved === 4 ? 5 : 1;
  const codes = [-3, -1, 0, 1, 2, 3, 4, 5];
  const code = codes.indexOf(rankedStatus);
  let statusMask = 0;
  for (let i = 0; i < 16; i++) statusMask += code * 2 ** (i * 3);

  return {
    id: parseInt(map.beatmap_id, 10),
    set_id: parseInt(map.beatmapset_id, 10),
    status: parseInt(map.approved, 10),
    status_mask: statusMask,
    md5: map.file_md5,
    artist: map.artist,
    title: map.title,
    version: map.version,
    creator: map.creator,
    filename,
    last_update: Math.floor(new Date(map.last_update).getTime() / 1000),
    total_length: parseInt(map.total_length, 10),
    hit_length: parseInt(map.hit_length || "0", 10),
    // lazer's count_circles/count_sliders/count_spinners. Without these the
    // difficulty picker bar renders empty.
    count_normal: parseInt(map.count_normal || "0", 10),
    count_slider: parseInt(map.count_slider || "0", 10),
    count_spinner: parseInt(map.count_spinner || "0", 10),
    max_combo: parseInt(map.max_combo || "0", 10),
    frozen: false,
    plays: 0,
    passes: 0,
    mode: parseInt(map.mode, 10),
    bpm: parseFloat(map.bpm),
    cs: parseFloat(map.diff_size),
    ar: parseFloat(map.diff_approach),
    od: parseFloat(map.diff_overall),
    hp: parseFloat(map.diff_drain),
    diff: parseFloat(map.difficultyrating),
  };
}

export async function getBeatmapByMd5(
  md5: string,
  filename?: string
): Promise<BeatmapResponse> {
  let beatmap = await beatmapRepo.fetchByMd5(md5);

  if (!beatmap && filename) {
    beatmap = await beatmapRepo.fetchByFilename(filename);

    if (beatmap) {
      return { status: 1, message: "md5_mismatch", beatmap };
    }
  }

  if (!beatmap) {
    const manager = new MirrorsManager();
    const metadataResult = await manager.getBeatmapMetadata({ h: md5 });

    if (metadataResult.success && metadataResult.data) {
      beatmap = parseOsuApiResponse(metadataResult.data);

      if (beatmap) {
        await beatmapRepo.insertBeatmap(beatmap);
        // The .osu is downloaded in the background, below, alongside every
        // other uncached map. Awaiting it here put a mirror round trip behind
        // every lobby map pick, which is the latency this endpoint exists to
        // avoid -- metadata is what callers actually need to render a row.
        startBackgroundOsuFetch(beatmap.id, md5);
      } else {
        return { status: -1, message: "unsubmitted" };
      }
    } else {
      return { status: -1, message: "unsubmitted" };
    }
  }

  const osuFilePath = path.join(config.beatmapsPath, `${beatmap.id}.osu`);

  try {
    const fileBuffer = await fs.readFile(osuFilePath);
    const fileMd5 = await calculateMd5(fileBuffer);

    if (fileMd5 === md5) {
      return { status: beatmap.status, beatmap, available: true };
    }
  } catch (err) {
    // Not cached yet (or unreadable). A background fetch is already running
    // from the miss path above; for a map that was already in `maps` but has
    // no file -- the case a lobby map pick actually hits -- start one now.
    startBackgroundOsuFetch(beatmap.id, md5);
  }

  // Metadata is in hand and is all a caller needs to render the map, so answer
  // now instead of blocking on a mirror. `available: false` is the honest
  // signal that the .osu is still being fetched.
  return { status: beatmap.status, beatmap, available: false };
}

/**
 * Fetch and cache a `.osu` without making the caller wait for it.
 *
 * One in-flight promise per beatmap id, so N concurrent lookups of the same
 * uncached map share one mirror fetch rather than racing N of them against the
 * same destination file.
 */
const backgroundOsuFetches = new Map<number, Promise<unknown>>();

function startBackgroundOsuFetch(beatmapId: number, md5: string): void {
  const existing = backgroundOsuFetches.get(beatmapId);
  if (existing) return;

  const pending = getOsuFile(beatmapId, md5)
    .catch(() => null) // a failed warm-up is not this caller's problem
    .finally(() => backgroundOsuFetches.delete(beatmapId));

  backgroundOsuFetches.set(beatmapId, pending);
}

/**
 * Import every difficulty in a beatmapset from the mirrors and upsert into
 * `maps`, downloading each .osu. Used to seed/backfill the library, since the
 * normal path only ever imports a map once someone plays it (by md5).
 */
export async function importBeatmapSet(
  setId: number
): Promise<{ imported: number; skipped: number; ids: number[] }> {
  const manager = new MirrorsManager();
  const result = await manager.getBeatmapMetadata({ s: String(setId) });

  if (!result.success || !result.data) {
    throw new Error(`mirror fetch failed for set ${setId}: ${result.error ?? "unknown"}`);
  }

  const ids: number[] = [];
  let skipped = 0;

  for (const _raw of Array.isArray(result.data) ? result.data : []) {
    const beatmap = parseOsuApiResponse([_raw]);
    if (!beatmap) {
      skipped++;
      continue;
    }

    // mirrors can be inconsistent per-difficulty; trust our own row when the
    // map is already known and the mirror gave us no md5 to identify it by.
    if (!beatmap.md5) {
      skipped++;
      continue;
    }

    await beatmapRepo.insertBeatmap(beatmap);
    ids.push(beatmap.id);

    // Metadata is what a caller needs to render the set, and it is now in
    // `maps`. The `.osu` warm-up runs in the background: awaiting it per
    // difficulty put a full set's mirror downloads behind the response.
    startBackgroundOsuFetch(beatmap.id, beatmap.md5);
  }

  return { imported: ids.length, skipped, ids };
}
