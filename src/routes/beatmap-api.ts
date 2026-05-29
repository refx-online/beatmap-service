import { FastifyInstance } from "fastify";
import { config } from "../config";

interface BeatmapApiQuery {
  k?: string;
  h?: string;
  s?: string;
  b?: string;
}

function normalizeMirrorApproved(approved: string): string {
  const n = parseInt(approved, 10);
  switch (n) {
    case 0: return "1";  // Ranked
    case 2: return "0";  // Pending
    case 3: return "3";  // Qualified
    case 5: return "-1"; // Graveyard
    case 7: return "1";  // Ranked (auto)
    case 8: return "4";  // Loved
    default: return "-2";
  }
}

export function registerBeatmapApi(app: FastifyInstance) {
  app.get<{ Querystring: BeatmapApiQuery }>("/v1/get_beatmaps", async (req, reply) => {
    const { h, s, b } = req.query;

    const params = new URLSearchParams();
    const usingOsuApi = !!config.osuApiKey;

    let url: string;
    if (usingOsuApi) {
      url = "https://old.ppy.sh/api/get_beatmaps";
      params.set("k", config.osuApiKey);
    } else {
      url = `${config.mirrorEndpoint}/api/get_beatmaps`;
    }

    if (h) params.set("h", h);
    if (s) params.set("s", s);
    if (b) params.set("b", b);

    try {
      const res = await fetch(`${url}?${params}`, {
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        return reply.code(res.status).send({ error: "upstream error" });
      }

      const data = await res.json();

      if (!usingOsuApi && Array.isArray(data)) {
        for (const map of data) {
          if (typeof map.approved === "string") {
            map.approved = normalizeMirrorApproved(map.approved);
          }
        }
      }

      return reply.send(data);
    } catch (err) {
      app.log.error(err, "beatmap api proxy failed");
      return reply.code(502).send({ error: "upstream unreachable" });
    }
  });
}
