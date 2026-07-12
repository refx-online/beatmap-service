import * as beatmapRepo from "../repositories/beatmap.js";
import { getOsuFile } from "../core/beatmap.js";
import { config } from "../config.js";
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
    return { status: -1, message: "unsubmitted" };
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
