import { FastifyInstance } from "fastify";
import { MirrorsManager } from "../mirrors/manager";

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
