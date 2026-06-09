import type {
  IMirrorClient,
  MirrorCapability,
  MirrorConfig,
  OsuFileOptions,
  BeatmapMetadataOptions,
  MirrorResult,
} from "./types";

const DEFAULT_TIMEOUT = 10_000; // Reduced from 30s to 10s for faster failover

export abstract class BaseMirror implements IMirrorClient {
  public readonly config: MirrorConfig;
  protected readonly timeout: number;

  constructor(config: MirrorConfig) {
    this.config = config;
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
  }

  abstract getOsuFile(options: OsuFileOptions): Promise<MirrorResult<Buffer>>;
  abstract getBeatmapMetadata(options: BeatmapMetadataOptions): Promise<MirrorResult<any>>;

  hasCapability(capability: MirrorCapability): boolean {
    return this.config.capabilities.includes(capability);
  }

  protected async fetchBuffer(url: string): Promise<MirrorResult<Buffer>> {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!res.ok) {
        return {
          success: false,
          data: null,
          error: `HTTP ${res.status}`,
        };
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      return {
        success: true,
        data: buffer,
      };
    } catch (err) {
      return {
        success: false,
        data: null,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  protected async fetchJson(url: string): Promise<MirrorResult<any>> {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!res.ok) {
        return {
          success: false,
          data: null,
          error: `HTTP ${res.status}`,
        };
      }

      const data = await res.json();
      return {
        success: true,
        data,
      };
    } catch (err) {
      return {
        success: false,
        data: null,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  protected notSupported(): MirrorResult<any> {
    return {
      success: false,
      data: null,
      error: "Operation not supported by this mirror",
    };
  }
}
