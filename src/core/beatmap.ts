import fs from "fs";
import path from "path";
import crypto from "crypto";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { config } from "../config";
import { MirrorsManager } from "../mirrors/manager";

const PRIVATE_MAP_THRESHOLD = 1_000_000_000;

let s3: S3Client | null = null;
let mirrorsManager: MirrorsManager | null = null;

function getS3(): S3Client | null {
  if (!config.r2.bucket || config.r2.bucket === "none") return null;
  if (!s3) {
    s3 = new S3Client({
      region: "auto",
      endpoint: `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.r2.accessKey,
        secretAccessKey: config.r2.secretKey,
      },
    });
  }
  return s3;
}

function beatmapKey(beatmapId: number): string {
  return `osu/${beatmapId}.osu`;
}

function localPath(beatmapId: number): string {
  return path.join(config.beatmapsPath, `${beatmapId}.osu`);
}

function isValidOsuFormat(data: Buffer): boolean {
  return data.slice(0, 100).toString("utf8").toLowerCase().includes("osu file format v14");
}

export function md5(data: Buffer): string {
  return crypto.createHash("md5").update(data).digest("hex");
}

async function loadFromR2(beatmapId: number): Promise<Buffer | null> {
  const client = getS3();
  if (!client) return null;

  try {
    const res = await client.send(new GetObjectCommand({
      Bucket: config.r2.bucket,
      Key: beatmapKey(beatmapId),
    }));
    if (!res.Body) return null;
    const chunks: Uint8Array[] = [];
    for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } catch {
    return null;
  }
}

async function saveToR2(beatmapId: number, data: Buffer): Promise<void> {
  const client = getS3();
  if (!client) return;

  try {
    await client.send(new PutObjectCommand({
      Bucket: config.r2.bucket,
      Key: beatmapKey(beatmapId),
      Body: data,
      ContentType: "text/plain",
    }));
  } catch {
    // non-fatal
  }
}

function saveToLocal(beatmapId: number, data: Buffer): void {
  fs.mkdirSync(config.beatmapsPath, { recursive: true });
  fs.writeFileSync(localPath(beatmapId), data);
}

function getMirrorsManager(): MirrorsManager {
  if (!mirrorsManager) {
    mirrorsManager = new MirrorsManager();
  }
  return mirrorsManager;
}

async function fetchFromMirror(beatmapId: number, expectedMd5?: string): Promise<Buffer | null> {
  const manager = getMirrorsManager();
  const result = await manager.getOsuFile({ beatmapId, expectedMd5 });
  return result.success ? result.data : null;
}

export async function getOsuFile(beatmapId: number, expectedMd5?: string): Promise<Buffer | null> {
  if (beatmapId >= PRIVATE_MAP_THRESHOLD) return null;

  const filePath = localPath(beatmapId);

  // 1. local disk
  if (fs.existsSync(filePath)) {
    const data = fs.readFileSync(filePath);
    if (isValidOsuFormat(data)) {
      if (!expectedMd5 || md5(data) === expectedMd5) return data;
      // md5 mismatch — fall through to re-fetch
    } else {
      fs.rmSync(filePath, { force: true });
    }
  }

  // 2. R2
  const r2Data = await loadFromR2(beatmapId);
  if (r2Data && r2Data.length > 0) {
    if (isValidOsuFormat(r2Data)) {
      if (!expectedMd5 || md5(r2Data) === expectedMd5) {
        saveToLocal(beatmapId, r2Data);
        return r2Data;
      }
      // md5 mismatch — fall through to re-fetch
    }
  }

  // 3. mirror fetch (with MD5 validation already handled in fetchFromMirror)
  const fetched = await fetchFromMirror(beatmapId, expectedMd5);
  if (!fetched) return null;

  if (!isValidOsuFormat(fetched)) return null;

  saveToLocal(beatmapId, fetched);
  await saveToR2(beatmapId, fetched);

  return fetched;
}
