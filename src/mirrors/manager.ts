import { config } from "../config";
import type { IMirrorClient, MirrorCapability, OsuFileOptions, BeatmapMetadataOptions, MirrorResult } from "./types";
import { OldPpyMirror } from "./clients/old-ppy";
import { OsuV2Mirror } from "./clients/osu-v2";
import { CatboyMirror } from "./clients/catboy";
import { NerinyanMirror } from "./clients/nerinyan";
import { DirectMirror } from "./clients/direct";
import { OsuApiV2Mirror } from "./clients/osu-api-v2";

export interface MirrorsManagerResult<T> {
  data: T | null;
  source: string | null;
  success: boolean;
  error?: string;
}

export class MirrorsManager {
  private readonly clients: IMirrorClient[] = [];

  constructor() {
    // Order is priority order: getOsuFile walks this list and takes the first
    // mirror that returns validated content, so the official osu! endpoint goes
    // first and the community mirrors are only ever fallbacks.
    const allMirrors: IMirrorClient[] = [
      new OsuApiV2Mirror(),
      new OsuV2Mirror(),
      new OldPpyMirror(),
      new CatboyMirror(),
      new NerinyanMirror(),
      new DirectMirror(),
    ];

    const ignored = new Set(config.mirrorsToIgnore.map((m) => m.toLowerCase()));
    this.clients = allMirrors.filter((mirror) => {
      const mirrorName = mirror.config.name.toLowerCase();
      return !ignored.has(mirrorName) && !ignored.has(mirrorName.split(".")[0]);
    });

    if (config.useMirrorOnly) {
      this.clients = this.clients.filter((mirror) =>
        ["osu.ppy.sh/api/v2", "osu.ppy.sh/v2"].includes(mirror.config.name)
      );
    }

    if (this.clients.length === 0) {
      throw new Error("No mirrors available - all mirrors are ignored in config");
    }
  }

  /**
   * Try mirrors one at a time, in configured priority order, and take the first
   * one that returns *validated* content.
   *
   * This used to be a `Promise.any` race, which meant whichever mirror happened
   * to answer first won -- including a mirror that returned a 200 with an HTML
   * error page or a stale revision. Sequential order also means we can put the
   * official osu! endpoint first and treat the community mirrors purely as
   * fallbacks.
   */
  async getOsuFile(options: OsuFileOptions): Promise<MirrorsManagerResult<Buffer>> {
    const clients = this.getClientsWithCapability(1 << 0); // DownloadOsuFile

    if (clients.length === 0) {
      return {
        data: null,
        source: null,
        success: false,
        error: "No mirrors available for .osu file downloads",
      };
    }

    const errors: string[] = [];

    for (const client of clients) {
      try {
        const result = await client.getOsuFile(options);

        if (result.success && result.data) {
          return { data: result.data, source: client.config.name, success: true };
        }

        const reason = result.error ?? "unknown error";
        // log the handoff: with the official endpoint first, a silent 401 from
        // osu! is otherwise invisible and it looks like the mirrors just work.
        console.log(`[mirror] ${client.config.name} failed: ${reason}`);
        errors.push(`${client.config.name}: ${reason}`);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.log(`[mirror] ${client.config.name} threw: ${reason}`);
        errors.push(`${client.config.name}: ${reason}`);
      }
    }

    return {
      data: null,
      source: null,
      success: false,
      error: errors.join("; "),
    };
  }

  async getBeatmapMetadata(options: BeatmapMetadataOptions): Promise<MirrorsManagerResult<any>> {
    const clients = this.getClientsWithCapability(1 << 1); // GetBeatmapMetadata

    if (clients.length === 0) {
      return {
        data: null,
        source: null,
        success: false,
        error: "No mirrors available for beatmap metadata",
      };
    }

    const promises = clients.map(async (client) => {
      const result = await client.getBeatmapMetadata(options);
      if (result.success && result.data && (!Array.isArray(result.data) || result.data.length > 0)) {
        return { data: result.data, source: client.config.name, success: true };
      }
      throw new Error(`${client.config.name}: ${result.error ?? "unknown error"}`);
    });

    try {
      return await Promise.any(promises);
    } catch (err) {
      const errors =
        err instanceof AggregateError
          ? err.errors.map((e) => e.message)
          : ["All mirrors failed"];
      return {
        data: null,
        source: null,
        success: false,
        error: errors.join("; "),
      };
    }
  }

  private getClientsWithCapability(capability: MirrorCapability): IMirrorClient[] {
    return this.clients.filter((client) => client.hasCapability(capability));
  }

  getAvailableMirrors(): string[] {
    return this.clients.map((c) => c.config.name);
  }
}
