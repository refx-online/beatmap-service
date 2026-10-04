import { BaseMirror } from "../base";
import {
  MirrorCapability,
  type BeatmapMetadataOptions,
  type MirrorResult,
  type OsuFileOptions,
} from "../types";
import { config } from "../../config";
import { md5 } from "../../core/beatmap";

/**
 * The official osu! API (api/v2), used as the preferred source for both .osu
 * downloads and metadata.
 *
 * Authentication: an osu! **API key**, sent as `Authorization: Bearer <key>`.
 * Note this is *not* an OAuth token -- osu!api v2 has no OAuth option, so the
 * OAuth client id/secret in the config cannot be used here. Generate a key at
 * https://osu.ppy.sh/home/account/edit#api and put it in OSU_API_KEY.
 *
 * The legacy alternatives are all dead as of 2026:
 *   - `osu.ppy.sh/osu-web/osu-mapfile.php?md5=` (which *did* take a user OAuth
 *     access token) now 404s for every map;
 *   - `osu.ppy.sh/osu-api/get_beatmap_info?k=` now 404s for every map, with a
 *     valid key or not.
 */
export class OsuApiV2Mirror extends BaseMirror {
  constructor() {
    super({
      name: "osu.ppy.sh/api/v2",
      baseUrl: "https://osu.ppy.sh/api/v2",
      timeout: 15_000,
      capabilities: [
        MirrorCapability.DownloadOsuFile,
        MirrorCapability.GetBeatmapMetadata,
      ],
    });
  }

  private get key(): string {
    return config.osuApiKey ?? "";
  }

  private async authenticated(url: string): Promise<Response> {
    const key = this.key;
    if (!key) throw new Error("OSU_API_KEY not set");

    return fetch(url, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(this.timeout),
    });
  }

  async getOsuFile(options: OsuFileOptions): Promise<MirrorResult<Buffer>> {
    if (!this.key) {
      return { success: false, data: null, error: "OSU_API_KEY not set" };
    }

    let res: Response;
    try {
      res = await this.authenticated(`${this.config.baseUrl}/beatmaps/${options.beatmapId}/osu-file`);
    } catch (err) {
      return {
        success: false,
        data: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    if (res.status === 401 || res.status === 403) {
      return { success: false, data: null, error: `auth rejected (${res.status})` };
    }
    if (!res.ok) {
      return { success: false, data: null, error: `HTTP ${res.status}` };
    }

    const data = Buffer.from(await res.arrayBuffer());

    // Same guard the other mirrors use. Without it a 200 carrying an HTML error
    // page would be written to disk as a beatmap.
    const header = data.subarray(0, 100).toString("utf8").toLowerCase();
    if (!header.includes("osu file format v")) {
      return { success: false, data: null, error: "Invalid .osu file format" };
    }

    if (options.expectedMd5 && md5(data) !== options.expectedMd5) {
      return { success: false, data: null, error: "MD5 mismatch" };
    }

    return { success: true, data, source: this.config.name } as MirrorResult<Buffer>;
  }

  async getBeatmapMetadata(options: BeatmapMetadataOptions): Promise<MirrorResult<any>> {
    if (!this.key) {
      return { success: false, data: null, error: "OSU_API_KEY not set" };
    }

    // api/v2 addresses beatmaps by id or checksum; a set id needs the
    // /beatmapsets/{id}/beatmaps listing instead.
    if (options.s && !options.b && !options.h) {
      return this.setMetadata(options.s);
    }

    const identifier = options.h
      ? `checksum/${options.h}`
      : options.b
        ? `${options.b}`
        : null;

    if (identifier === null) {
      return { success: false, data: null, error: "need h, b or s" };
    }

    try {
      const res = await this.authenticated(`${this.config.baseUrl}/beatmaps/${identifier}`);

      if (!res.ok) {
        return { success: false, data: null, error: `HTTP ${res.status}` };
      }

      const beatmap = await res.json();
      return { success: true, data: [beatmap] };
    } catch (err) {
      return {
        success: false,
        data: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private async setMetadata(setId: string): Promise<MirrorResult<any>> {
    try {
      const res = await this.authenticated(
        `${this.config.baseUrl}/beatmapsets/${setId}/beatmaps?limit=100`
      );

      if (!res.ok) {
        return { success: false, data: null, error: `HTTP ${res.status}` };
      }

      const payload: any = await res.json();
      const beatmaps = payload?.beatmaps;
      const set = Array.isArray(beatmaps) ? beatmaps[0]?.beatmapset : undefined;

      if (!Array.isArray(beatmaps) || beatmaps.length === 0) {
        return { success: false, data: null, error: "empty set" };
      }

      // map onto the v1 field names the importer already understands
      const data = beatmaps.map((b: any) => ({
        beatmap_id: String(b.id),
        beatmapset_id: String(b.beatmapset_id),
        approved: String(b.ranked),
        total_length: String(b.total_length),
        hit_length: String(b.hit_length),
        version: b.version,
        file_md5: b.checksum ?? "",
        diff_size: String(b.cs),
        diff_overall: String(b.accuracy),
        diff_approach: String(b.ar),
        diff_drain: String(b.drain),
        mode: String(b.mode_int),
        count_normal: String(b.count_circles),
        count_slider: String(b.count_sliders),
        count_spinner: String(b.count_spinners),
        playcount: String(b.playcount),
        passcount: String(b.passcount),
        max_combo: b.max_combo != null ? String(b.max_combo) : null,
        difficultyrating: String(b.difficulty_rating),
        last_update: b.last_updated,
        ...(b.bpm != null ? { bpm: String(b.bpm) } : {}),
        ...(set
          ? {
              artist: set.artist,
              title: set.title,
              creator: set.creator,
            }
          : {}),
      }));

      return { success: true, data };
    } catch (err) {
      return {
        success: false,
        data: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
