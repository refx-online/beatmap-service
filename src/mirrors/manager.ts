import { config } from "../config";
import type { IMirrorClient, MirrorCapability, OsuFileOptions, BeatmapMetadataOptions, MirrorResult } from "./types";
import { OldPpyMirror } from "./clients/old-ppy";
import { OsuV2Mirror } from "./clients/osu-v2";
import { CatboyMirror } from "./clients/catboy";
import { NerinyanMirror } from "./clients/nerinyan";
import { DirectMirror } from "./clients/direct";

export interface MirrorsManagerResult<T> {
  data: T | null;
  source: string | null;
  success: boolean;
  error?: string;
}

export class MirrorsManager {
  private readonly clients: IMirrorClient[] = [];

  constructor() {
    const allMirrors: IMirrorClient[] = [
      new OldPpyMirror(),
      new OsuV2Mirror(),
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
      this.clients = this.clients.filter(
        (mirror) => mirror.config.name !== "old.ppy.sh" && mirror.config.name !== "osu.ppy.sh/v2"
      );
    }

    if (this.clients.length === 0) {
      throw new Error("No mirrors available - all mirrors are ignored in config");
    }
  }

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

    const promises = clients.map(async (client) => {
      const result = await client.getOsuFile(options);
      if (result.success && result.data) {
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
      if (result.success && result.data) {
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
