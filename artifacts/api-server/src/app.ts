import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
// Camera images are sent as base64 JSON. Keep this slightly above the route's
// validated 5 MB base64 ceiling so oversized requests receive a clear response.
app.use(express.json({ limit: "7mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  const bodyError = err as { type?: string; status?: number };
  if (bodyError.type === "entity.too.large" || bodyError.status === 413) {
    res.status(413).json({
      error: "PAYLOAD_TOO_LARGE",
      message: "The camera image is too large. Move closer to the question and try again.",
    });
    return;
  }

  if (bodyError.type === "entity.parse.failed") {
    res.status(400).json({
      error: "BAD_REQUEST",
      message: "The request body must be valid JSON.",
    });
    return;
  }

  req.log.error({ err }, "Unhandled API error");
  res.status(500).json({ error: "INTERNAL_ERROR", message: "Something went wrong while processing the request." });
});

export default app;
