import { BaseMirror } from "../base";
import { MirrorCapability, type OsuFileOptions, type BeatmapMetadataOptions, type MirrorResult } from "../types";
import { md5 } from "../../core/beatmap";

export class CatboyMirror extends BaseMirror {
  constructor() {
    super({
      name: "catboy.best",
      baseUrl: "https://catboy.best",
      capabilities: [MirrorCapability.DownloadOsuFile],
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
        return {
          success: false,
          data: null,
          error: "MD5 mismatch",
        };
      }
    }

    return result;
  }

  async getBeatmapMetadata(_options: BeatmapMetadataOptions): Promise<MirrorResult<any>> {
    return this.notSupported();
  }
}
