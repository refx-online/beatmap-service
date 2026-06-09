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
3. Mirror fetch (via `MirrorsManager`) — result written back to both local and R2

Beatmaps with `id >= 1_000_000_000` are rejected (private map threshold). Files are validated by checking for `"osu file format v14"` in the first 100 bytes. MD5 mismatch on local/R2 causes a re-fetch from mirror.

**`src/mirrors/` — multi-mirror service layer**

Pattern adapted from [Observatory](https://github.com/osu-atri/observatory). Supports multiple beatmap mirrors with fallback:

- `types.ts` — `MirrorCapability` enum (per-mirror abilities), `IMirrorClient` interface, shared option/result types
- `base.ts` — `BaseMirror` abstract class with `fetchBuffer()` / `fetchJson()` helpers and timeout handling
- `manager.ts` — `MirrorsManager` class: instantiates all mirrors, filters by `MIRRORS_TO_IGNORE`, provides fallback loops for `getOsuFile()` and `getBeatmapMetadata()`
- `clients/old-ppy.ts` — OldPpyMirror: downloads `.osu` files from `old.ppy.sh/osu/` + official API metadata (`/api/get_beatmaps`, requires `OSU_API_KEY`)
- `clients/catboy.ts` — CatboyMirror: downloads `.osu` files from `catboy.best/osu/` (download only)
- `clients/nerinyan.ts` — NerinyanMirror: downloads `.osu` files + beatmap metadata (`/v1/get_beatmaps`) from `api.nerinyan.moe/`
- `clients/direct.ts` — DirectMirror: downloads `.osu` files + beatmap metadata (`/api/get_beatmaps`) from `osu.direct/`

**Mirror selection & fallback:**
- Each mirror declares capabilities via `MirrorCapability` flags
- `MirrorsManager.getOsuFile()` iterates all mirrors with `DownloadOsuFile` ability until one succeeds
- `MirrorsManager.getBeatmapMetadata()` iterates all mirrors with `GetBeatmapMetadata` ability
- Mirrors can be disabled at startup via `MIRRORS_TO_IGNORE` env var (comma-separated names)

**To add a new mirror:**
1. Create `src/mirrors/clients/<name>.ts` extending `BaseMirror`
2. Declare capabilities in constructor
3. Implement supported methods
4. Register instance in `MirrorsManager` constructor

**Routes:**
- `GET /v1/get-osu/:id?md5=` — returns raw `.osu` file bytes
- `GET /v1/ensure-osu/:id?md5=` — checks existence, returns `{ok: true}` (used by omajinai/recalculate to warm cache)
- `GET /v1/get_beatmaps?h=&s=&b=` — proxies beatmap metadata via `MirrorsManager`. **Rotation:** tries mirrors in order (old.ppy.sh/official API first if `OSU_API_KEY` set and `USE_MIRROR_ONLY=false`, then catboy, osulabs, direct) with automatic fallback until one succeeds.
- `GET /cover/:set_id?type=` — proxies beatmapset cover images from `assets.ppy.sh`; valid types: `cover`, `cover@2x`, `card`, `card@2x`, `list`, `list@2x`, `slimcover`, `slimcover@2x`; defaults to `card`.

**`src/config.ts`** — all env vars in one place, no validation.

## Key env vars

| Var | Default | Notes |
|---|---|---|
| `BEATMAPS_PATH` | `/srv/root/.data/osu` | shared volume with omajinai/recalculate |
| `OSU_MIRROR_URL` | `https://old.ppy.sh/osu` | legacy single-mirror URL (kept for backward compat) |
| `OSU_API_KEY` | _(empty)_ | if set and `USE_MIRROR_ONLY=false`, metadata uses official API first, then mirrors on failure |
| `USE_MIRROR_ONLY` | `false` | if `true`, skip official API and use mirrors only for metadata |
| `MIRROR_ENDPOINT` | `https://catboy.best` | legacy fallback metadata source |
| `MIRRORS_TO_IGNORE` | _(empty)_ | comma-separated mirror names to disable: `old.ppy.sh, nerinyan.moe` |
| `R2_BUCKET` | _(empty)_ | set to `"none"` or leave empty to disable R2 |

Mirror names in `MIRRORS_TO_IGNORE`: `old.ppy.sh` (or `old`), `catboy.best` (or `catboy`), `nerinyan.moe` (or `nerinyan`), `osu.direct` (or `direct`).
