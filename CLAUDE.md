# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install        # install deps
npm run dev        # ts-node dev server
npm run build      # tsc → dist/
npm run start      # run compiled output
```

No test runner configured.

## Architecture

Single Fastify service (TypeScript) that acts as a `.osu` file cache and beatmap metadata proxy for the re;fx stack.

**Entry:** `src/index.ts` — registers three route groups, starts server.

**`src/beatmap.ts` — core logic**

`getOsuFile(beatmapId, expectedMd5?)` resolves `.osu` files via a three-tier waterfall:
1. Local disk (`BEATMAPS_PATH/{id}.osu`)
2. Cloudflare R2 (`osu/{id}.osu`) — only if `R2_BUCKET` is set and not `"none"`
3. Mirror fetch (`OSU_MIRROR_URL/{id}`) — result written back to both local and R2

Beatmaps with `id >= 1_000_000_000` are rejected (private map threshold). Files are validated by checking for `"osu file format v14"` in the first 100 bytes. MD5 mismatch on local/R2 causes a re-fetch from mirror.

**Routes:**
- `GET /v1/get-osu/:id?md5=` — returns raw `.osu` file bytes
- `GET /v1/ensure-osu/:id?md5=` — checks existence, returns `{ok: true}` (used by omajinai/recalculate to warm cache)
- `GET /v1/get_beatmaps?h=&s=&b=` — proxies beatmap metadata; uses `old.ppy.sh/api` if `OSU_API_KEY` set, otherwise `MIRROR_ENDPOINT/api/get_beatmaps`. Mirror responses have their `approved` field normalized via `normalizeMirrorApproved()` to match osu! API v1 status codes.
- `GET /cover/:set_id?type=` — proxies beatmapset cover images from `assets.ppy.sh`; valid types: `cover`, `cover@2x`, `card`, `card@2x`, `list`, `list@2x`, `slimcover`, `slimcover@2x`; defaults to `card`.

**`src/config.ts`** — all env vars in one place, no validation.

## Key env vars

| Var | Default | Notes |
|---|---|---|
| `BEATMAPS_PATH` | `/srv/root/.data/osu` | shared volume with omajinai/recalculate |
| `OSU_MIRROR_URL` | `https://old.ppy.sh/osu` | source for downloading `.osu` files |
| `OSU_API_KEY` | _(empty)_ | if set, metadata uses official API |
| `MIRROR_ENDPOINT` | `https://catboy.best` | fallback metadata source |
| `R2_BUCKET` | _(empty)_ | set to `"none"` or leave empty to disable R2 |
