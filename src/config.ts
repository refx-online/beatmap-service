export const config = {
  port: parseInt(process.env.PORT ?? "3030", 10),
  host: process.env.HOST ?? "0.0.0.0",
  beatmapsPath: process.env.BEATMAPS_PATH ?? "/srv/root/.data/osu",
  osuMirrorUrl: (process.env.OSU_MIRROR_URL ?? "https://old.ppy.sh/osu").replace(/\/$/, ""),
  osuApiKey: process.env.OSU_API_KEY ?? "",
  osuClientId: process.env.OSU_CLIENT_ID ?? "",
  osuClientSecret: process.env.OSU_CLIENT_SECRET ?? "",
  useMirrorOnly: process.env.USE_MIRROR_ONLY === "true",
  mirrorsToIgnore: (process.env.MIRRORS_TO_IGNORE ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter((m) => m.length > 0),
  r2: {
    accountId: process.env.R2_ACCOUNT_ID ?? "",
    accessKey: process.env.R2_ACCESS_KEY ?? "",
    secretKey: process.env.R2_SECRET_KEY ?? "",
    bucket: process.env.R2_BUCKET ?? "",
  },
};
