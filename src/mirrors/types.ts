export enum MirrorCapability {
  DownloadOsuFile = 1 << 0,    // Can download .osu files
  GetBeatmapMetadata = 1 << 1, // Can fetch beatmap metadata via API
}

export interface MirrorConfig {
  name: string;
  baseUrl: string;
  capabilities: MirrorCapability[];
  timeout?: number;
}

export interface OsuFileOptions {
  beatmapId: number;
  expectedMd5?: string;
}

export interface BeatmapMetadataOptions {
  h?: string; // hash
  s?: string; // beatmapset id
  b?: string; // beatmap id
}

export interface MirrorResult<T> {
  data: T | null;
  success: boolean;
  error?: string;
}

export interface IMirrorClient {
  readonly config: MirrorConfig;

  /**
   * Download a .osu file by beatmap ID
   * Returns Buffer on success, null on failure
   */
  getOsuFile(options: OsuFileOptions): Promise<MirrorResult<Buffer>>;

  /**
   * Fetch beatmap metadata (for get_beatmaps API endpoint)
   * Returns JSON data on success, null on failure
   */
  getBeatmapMetadata(options: BeatmapMetadataOptions): Promise<MirrorResult<any>>;

  /**
   * Check if this mirror has a specific capability
   */
  hasCapability(capability: MirrorCapability): boolean;
}
