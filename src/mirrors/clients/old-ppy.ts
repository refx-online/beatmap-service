import { BaseMirror } from "../base";
import { MirrorCapability, type OsuFileOptions, type BeatmapMetadataOptions, type MirrorResult } from "../types";
import { md5 } from "../../beatmap";
import { config } from "../../config";

export class OldPpyMirror extends BaseMirror {
  constructor() {
    super({
      name: "old.ppy.sh",
      baseUrl: "https://old.ppy.sh/osu",
      capabilities: [
        MirrorCapability.DownloadOsuFile,
        MirrorCapability.GetBeatmapMetadata,
      ],
    });
  }

  async getOsuFile(options: OsuFileOptions): Promise<MirrorResult<Buffer>> {
    const url = `${this.config.baseUrl}/${options.beatmapId}`;
    const result = await this.fetchBuffer(url);

    if (!result.success || !result.data) {
      return result;
    }

    const header = result.data.slice(0, 100).toString("utf8").toLowerCase();
    if (!header.includes("osu file format v14")) {
      return {
        success: false,
        data: null,
        error: "Invalid .osu file format",
      };
    }

    if (options.expectedMd5) {
      const hash = md5(result.data);
      if (hash !== options.expectedMd5) {
        return {
          success: false,
          data: null,
          error: "MD5 mismatch",
        };
      }
    }

    return result;
  }

  async getBeatmapMetadata(options: BeatmapMetadataOptions): Promise<MirrorResult<any>> {
    if (!config.osuApiKey) {
      return {
        success: false,
        data: null,
        error: "OSU_API_KEY not set",
      };
    }

    const params = new URLSearchParams();
    params.set("k", config.osuApiKey);
    if (options.h) params.set("h", options.h);
    if (options.s) params.set("s", options.s);
    if (options.b) params.set("b", options.b);

    const url = `https://old.ppy.sh/api/get_beatmaps?${params}`;
    return await this.fetchJson(url);
  }
}
