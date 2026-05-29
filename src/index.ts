import "dotenv/config";
import Fastify from "fastify";
import { registerOsuFile } from "./routes/osu-file";
import { registerBeatmapApi } from "./routes/beatmap-api";
import { registerCover } from "./routes/cover";

const isDev = process.env.NODE_ENV !== "production";

const app = Fastify({
  logger: {
    transport: isDev
      ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" } }
      : undefined,
  },
});

registerOsuFile(app);
registerBeatmapApi(app);
registerCover(app);

const host = process.env.HOST ?? "0.0.0.0";
const port = parseInt(process.env.PORT ?? "3030", 10);

app.listen({ host, port }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
});

const shutdown = async () => {
  await app.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
