import { fetchOne } from "../db.js";

export interface Beatmap {
  id: number;
  set_id: number;
  status: number;
  md5: string;
  artist: string;
  title: string;
  version: string;
  creator: string;
  filename: string;
  last_update: number;
  total_length: number;
  max_combo: number;
  frozen: boolean;
  plays: number;
  passes: number;
  mode: number;
  bpm: number;
  cs: number;
  ar: number;
  od: number;
  hp: number;
  diff: number;
}

interface BeatmapRow {
  id: number;
  set_id: number;
  status: number;
  md5: string;
  artist: string;
  title: string;
  version: string;
  creator: string;
  filename: string;
  last_update: number;
  total_length: number;
  max_combo: number;
  frozen: number;
  plays: number;
  passes: number;
  mode: number;
  bpm: number;
  cs: number;
  ar: number;
  od: number;
  hp: number;
  diff: number;
}

function transformBeatmap(row: BeatmapRow): Beatmap {
  return {
    ...row,
    frozen: row.frozen === 1,
  };
}

export async function fetchByMd5(md5: string): Promise<Beatmap | null> {
  const row = await fetchOne<BeatmapRow>(
    `SELECT id, set_id, status, md5, artist, title, version, creator, filename,
            last_update, total_length, max_combo, frozen, plays, passes, mode, bpm, cs, ar, od, hp, diff
     FROM maps WHERE md5 = ?`,
    [md5]
  );
  return row ? transformBeatmap(row) : null;
}

export async function fetchByFilename(filename: string): Promise<Beatmap | null> {
  const row = await fetchOne<BeatmapRow>(
    `SELECT id, set_id, status, md5, artist, title, version, creator, filename,
            last_update, total_length, max_combo, frozen, plays, passes, mode, bpm, cs, ar, od, hp, diff
     FROM maps WHERE filename = ?`,
    [filename]
  );
  return row ? transformBeatmap(row) : null;
}
