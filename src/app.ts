import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { corsOrigins, env } from "./config/env.js";
import { errorHandler, notFound } from "./middleware/http.js";
import { rateLimit } from "./middleware/rateLimit.js";
import adminRouter from "./routes/admin.js";
import authRouter from "./routes/auth.js";
import giftcodeRouter from "./routes/giftcode.js";
import healthRouter from "./routes/health.js";
import playersRouter from "./routes/players.js";
import postsRouter from "./routes/posts.js";
import topupRouter from "./routes/topup.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(morgan("dev"));
  app.use(express.json({ limit: "1mb" }));
  app.use(cors({ origin: corsOrigins, credentials: true }));
  app.use(rateLimit);

  const api = express.Router();
  api.use("/health", healthRouter);
  api.use("/auth", authRouter);
  api.use("/posts", postsRouter);
  api.use("/players", playersRouter);
  api.use("/giftcode", giftcodeRouter);
  api.use("/topup", topupRouter);
  api.use("/admin", adminRouter);

  app.use(env.API_PREFIX, api);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
