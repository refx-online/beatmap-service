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
}

async function calculateMd5(buffer: Buffer): Promise<string> {
  return crypto.createHash("md5").update(buffer).digest("hex");
}

function parseOsuApiResponse(data: any): beatmapRepo.Beatmap | null {
  if (!Array.isArray(data) || data.length === 0) return null;

  const map = data[0];
  const filename = `${map.artist} - ${map.title} (${map.creator}) [${map.version}].osu`;

  return {
    id: parseInt(map.beatmap_id, 10),
    set_id: parseInt(map.beatmapset_id, 10),
    status: parseInt(map.approved, 10),
    md5: map.file_md5,
    artist: map.artist,
    title: map.title,
    version: map.version,
    creator: map.creator,
    filename,
    last_update: Math.floor(new Date(map.last_update).getTime() / 1000),
    total_length: parseInt(map.total_length, 10),
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
        await getOsuFile(beatmap.id, md5);
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
      return { status: beatmap.status, beatmap };
    }
  } catch (err) {
    // file doesn't exist or can't be read, try to fetch
  }

  const fetchedBuffer = await getOsuFile(beatmap.id, md5);

  if (!fetchedBuffer) {
    return { status: 1, message: "update_required", beatmap };
  }

  const fetchedMd5 = await calculateMd5(fetchedBuffer);

  if (fetchedMd5 !== md5) {
    return { status: 1, message: "md5_mismatch", beatmap };
  }

  return { status: beatmap.status, beatmap };
}
