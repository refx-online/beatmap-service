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

export async function insertBeatmap(beatmap: Omit<Beatmap, 'frozen' | 'plays' | 'passes'>): Promise<void> {
  const { pool } = await import("../db.js");
  await pool.execute(
    `INSERT INTO maps (server, id, set_id, status, md5, artist, title, version, creator, filename,
                       last_update, total_length, max_combo, frozen, plays, passes, mode, bpm, cs, ar, od, hp, diff)
     VALUES ('osu!', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       set_id = VALUES(set_id),
       status = VALUES(status),
       md5 = VALUES(md5),
       artist = VALUES(artist),
       title = VALUES(title),
       version = VALUES(version),
       creator = VALUES(creator),
       filename = VALUES(filename),
       last_update = VALUES(last_update),
       total_length = VALUES(total_length),
       max_combo = VALUES(max_combo),
       mode = VALUES(mode),
       bpm = VALUES(bpm),
       cs = VALUES(cs),
       ar = VALUES(ar),
       od = VALUES(od),
       hp = VALUES(hp),
       diff = VALUES(diff)`,
    [
      beatmap.id,
      beatmap.set_id,
      beatmap.status,
      beatmap.md5,
      beatmap.artist,
      beatmap.title,
      beatmap.version,
      beatmap.creator,
      beatmap.filename,
      new Date(beatmap.last_update * 1000),
      beatmap.total_length,
      beatmap.max_combo,
      beatmap.mode,
      beatmap.bpm,
      beatmap.cs,
      beatmap.ar,
      beatmap.od,
      beatmap.hp,
      beatmap.diff,
    ]
  );
}
