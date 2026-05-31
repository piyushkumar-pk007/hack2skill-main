import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import * as helmet from "helmet";
import { env } from "./config/env.js";
import { ensureDatabaseConnection } from "./middleware/database.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { sanitizeMutableInput } from "./middleware/sanitize.js";
import healthRouter from "./routes/health.js";
import apiRouter from "./routes/index.js";

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");

const allowedOrigins = new Set(env.clientOrigins);

app.use(
  helmet.default({
    crossOriginResourcePolicy: false,
  })
);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin.replace(/\/$/, ""))) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(sanitizeMutableInput);

app.get("/", (_req, res) => {
  res.json({
    name: "Wayfinder API",
    status: "ok",
    docs: "/api/health",
  });
});

app.use("/api", healthRouter);
app.use("/api", ensureDatabaseConnection, apiRouter);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
