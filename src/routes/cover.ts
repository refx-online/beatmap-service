import { FastifyInstance } from "fastify";

const COVER_TYPES = new Set(["cover", "cover@2x", "card", "card@2x", "list", "list@2x", "slimcover", "slimcover@2x"]);

interface CoverQuery {
  type?: string;
}

export function registerCover(app: FastifyInstance) {
  app.get<{ Params: { set_id: string }; Querystring: CoverQuery }>("/cover/:set_id", async (req, reply) => {
    const setId = parseInt(req.params.set_id, 10);
    if (isNaN(setId) || setId <= 0) {
      return reply.code(400).send({ error: "invalid set id" });
    }

    const type = req.query.type && COVER_TYPES.has(req.query.type) ? req.query.type : "card";
    const url = `https://assets.ppy.sh/beatmaps/${setId}/covers/${type}.jpg`;

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });

      if (!res.ok) {
        return reply.code(res.status).send({ error: "cover not found" });
      }

      const data = Buffer.from(await res.arrayBuffer());
      reply.header("Content-Type", "image/jpeg");
      reply.header("Content-Length", data.length);
      reply.header("Cache-Control", "public, max-age=86400");
      return reply.send(data);
    } catch {
      return reply.code(502).send({ error: "upstream unreachable" });
    }
  });
}
