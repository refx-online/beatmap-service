import { BaseMirror } from "../base";
import { MirrorCapability, type OsuFileOptions, type BeatmapMetadataOptions, type MirrorResult } from "../types";
import { osuOAuth } from "../../core/auth";

interface BeatmapV2 {
  id: number;
  beatmapset_id: number;
  mode: string;
  mode_int: number;
  difficulty_rating: number;
  version: string;
  total_length: number;
  hit_length: number;
  bpm: number | null;
  cs: number;
  drain: number;
  accuracy: number;
  ar: number;
  playcount: number;
  passcount: number;
  count_circles: number;
  count_sliders: number;
  count_spinners: number;
  count_total: number;
  is_scoreable: boolean;
  last_updated: string;
  ranked: number;
  status: string;
  url: string;
  checksum: string | null;
  max_combo: number | null;
  beatmapset?: {
    id: number;
    title: string;
    artist: string;
    creator: string;
    user_id: number;
    covers?: any;
    status: string;
    [key: string]: any;
  };
}

export class OsuV2Mirror extends BaseMirror {
  constructor() {
    super({
      name: "osu.ppy.sh/v2",
      baseUrl: "https://osu.ppy.sh/api/v2",
      capabilities: [MirrorCapability.GetBeatmapMetadata],
    });
  }

  private transformV2ToV1(beatmap: BeatmapV2): any {
    const v1: any = {
      beatmap_id: String(beatmap.id),
      beatmapset_id: String(beatmap.beatmapset_id),
      approved: String(beatmap.ranked),
      total_length: String(beatmap.total_length),
      hit_length: String(beatmap.hit_length),
      version: beatmap.version,
      file_md5: beatmap.checksum ?? "",
      diff_size: String(beatmap.cs),
      diff_overall: String(beatmap.accuracy),
      diff_approach: String(beatmap.ar),
      diff_drain: String(beatmap.drain),
      mode: String(beatmap.mode_int),
      count_normal: String(beatmap.count_circles),
      count_slider: String(beatmap.count_sliders),
      count_spinner: String(beatmap.count_spinners),
      playcount: String(beatmap.playcount),
      passcount: String(beatmap.passcount),
      max_combo: beatmap.max_combo !== null ? String(beatmap.max_combo) : null,
      difficultyrating: String(beatmap.difficulty_rating),
    };

    if (beatmap.bpm !== null) {
      v1.bpm = String(beatmap.bpm);
    }

    if (beatmap.beatmapset) {
      v1.artist = beatmap.beatmapset.artist;
      v1.title = beatmap.beatmapset.title;
      v1.creator = beatmap.beatmapset.creator;
      v1.creator_id = String(beatmap.beatmapset.user_id);
    }

    return v1;
  }

  async getOsuFile(options: OsuFileOptions): Promise<MirrorResult<Buffer>> {
    return this.notSupported();
  }

  async getBeatmapMetadata(options: BeatmapMetadataOptions): Promise<MirrorResult<any>> {
    if (!options.b) {
      return {
        success: false,
        data: null,
        error: "v2 API requires beatmap ID (b parameter)",
      };
    }

    const token = await osuOAuth.getToken();
    if (!token) {
      return {
        success: false,
        data: null,
        error: "OAuth not configured (missing OSU_CLIENT_ID/OSU_CLIENT_SECRET)",
      };
    }

    const url = `${this.config.baseUrl}/beatmaps/${options.b}`;
    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!res.ok) {
        return {
          success: false,
          data: null,
          error: `HTTP ${res.status}`,
        };
      }

      const beatmap = (await res.json()) as BeatmapV2;
      const v1Format = this.transformV2ToV1(beatmap);

      return {
        success: true,
        data: [v1Format],
      };
    } catch (err) {
      return {
        success: false,
        data: null,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }
}
