import { FastifyInstance } from "fastify";
import { getOsuFile } from "../core/beatmap";
import { getOszFile } from "../core/osz";

interface OsuFileQuery {
  md5?: string;
}

export function registerOsuFile(app: FastifyInstance) {
  app.get<{ Params: { id: string }; Querystring: OsuFileQuery }>("/v1/get-osu/:id", async (req, reply) => {
    const beatmapId = parseInt(req.params.id, 10);
    if (isNaN(beatmapId) || beatmapId <= 0) {
      return reply.code(400).send({ error: "invalid beatmap id" });
    }

    const data = await getOsuFile(beatmapId, req.query.md5);
    if (!data) {
      return reply.code(404).send({ error: "beatmap not found" });
    }

    reply.header("Content-Type", "text/plain; charset=utf-8");
    reply.header("Content-Length", data.length);
    return reply.send(data);
  });

  app.get<{ Params: { id: string }; Querystring: OsuFileQuery }>("/v1/ensure-osu/:id", async (req, reply) => {
    const beatmapId = parseInt(req.params.id, 10);
    if (isNaN(beatmapId) || beatmapId <= 0) {
      return reply.code(400).send({ error: "invalid beatmap id" });
    }

    const data = await getOsuFile(beatmapId, req.query.md5);
    if (!data) {
      return reply.code(404).send({ error: "beatmap not found" });
    }

    return reply.code(200).send({ ok: true });
  });

  app.get<{ Params: { setId: string } }>("/v1/get-osz/:setId", async (req, reply) => {
    const setId = parseInt(req.params.setId, 10);
    if (isNaN(setId) || setId <= 0) {
      return reply.code(400).send({ error: "invalid set id" });
    }

    const data = await getOszFile(setId);
    if (!data) {
      return reply.code(404).send({ error: "beatmap set not found" });
    }

    reply.header("Content-Type", "application/x-osu-beatmap-archive");
    reply.header("Content-Length", data.length);
    reply.header("Content-Disposition", `attachment; filename="${setId}.osz"`);
    return reply.send(data);
  });
}
