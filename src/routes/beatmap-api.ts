import { FastifyInstance } from "fastify";
import { MirrorsManager } from "../mirrors/manager";
import * as lifecycleService from "../services/lifecycle";

interface BeatmapApiQuery {
  k?: string;
  h?: string;
  s?: string;
  b?: string;
}

let mirrorsManager: MirrorsManager | null = null;

function getMirrorsManager(): MirrorsManager {
  if (!mirrorsManager) {
    mirrorsManager = new MirrorsManager();
  }
  return mirrorsManager;
}

export function registerBeatmapApi(app: FastifyInstance) {
  app.get<{ Params: { md5: string }; Querystring: { filename?: string } }>(
    "/v1/beatmap/:md5",
    async (req, reply) => {
      const { md5 } = req.params;
      const { filename } = req.query;

      const result = await lifecycleService.getBeatmapByMd5(md5, filename);

      // Only a map we know nothing about collapses to the legacy wire codes.
      // A map whose metadata resolved but whose `.osu` is still downloading in
      // the background is returned as full JSON with `available: false`:
      // collapsing it to `1|false` threw the metadata away, so a caller that
      // just wanted to render a lobby row got nothing and 404'd downstream.
      // forlorn reads `available` and maps it back to UpdateRequired.
      if (!result.beatmap) {
        return reply.code(200).send("-1|false");
      }

      return reply.code(200).send({
        status: result.status,
        beatmap: result.beatmap,
        available: result.available === true,
      });
    }
  );

  app.get<{ Params: { setId: string } }>("/v1/import/:setId", async (req, reply) => {
    const setId = parseInt(req.params.setId, 10);
    if (Number.isNaN(setId)) {
      return reply.code(400).send({ error: "invalid beatmapset id" });
    }

    try {
      const result = await lifecycleService.importBeatmapSet(setId);
      app.log.info(result, "imported beatmapset");
      return reply.send(result);
    } catch (error) {
      app.log.error({ error, setId }, "beatmapset import failed");
      return reply.code(502).send({ error: String(error) });
    }
  });

  app.get<{ Querystring: BeatmapApiQuery }>("/v1/get_beatmaps", async (req, reply) => {
    const { h, s, b } = req.query;

    const manager = getMirrorsManager();
    const result = await manager.getBeatmapMetadata({ h, s, b });

    if (!result.success || !result.data) {
      app.log.error({ error: result.error, source: result.source }, "beatmap metadata fetch failed");
      return reply.code(502).send({ error: result.error ?? "all sources failed" });
    }

    app.log.info({ source: result.source }, "beatmap metadata from", result.source);
    return reply.send(result.data);
  });
}
