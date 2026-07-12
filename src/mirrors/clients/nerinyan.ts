import { BaseMirror } from "../base";
import { MirrorCapability, type OsuFileOptions, type BeatmapMetadataOptions, type MirrorResult } from "../types";
import { md5 } from "../../core/beatmap";

export class NerinyanMirror extends BaseMirror {
  constructor() {
    super({
      name: "nerinyan.moe",
      baseUrl: "https://api.nerinyan.moe",
      capabilities: [
        MirrorCapability.DownloadOsuFile,
        MirrorCapability.GetBeatmapMetadata,
      ],
    });
  }

  async getOsuFile(options: OsuFileOptions): Promise<MirrorResult<Buffer>> {
    const url = `${this.config.baseUrl}/osu/${options.beatmapId}`;
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
        console.log(`[nerinyan] MD5 mismatch: beatmap=${options.beatmapId}, expected=${options.expectedMd5}, actual=${hash}`);
        return {
          success: false,
          data: null,
          error: "MD5 mismatch",
        };
      }
      console.log(`[nerinyan] MD5 match: beatmap=${options.beatmapId}, hash=${hash}`);
    }

    return result;
  }

  async getBeatmapMetadata(options: BeatmapMetadataOptions): Promise<MirrorResult<any>> {
    const params = new URLSearchParams();
    if (options.s) params.set("s", options.s);
    if (options.b) params.set("b", options.b);
    if (options.h) params.set("h", options.h);

    const url = `${this.config.baseUrl}/v1/get_beatmaps?${params}`;
    return await this.fetchJson(url);
  }
}
