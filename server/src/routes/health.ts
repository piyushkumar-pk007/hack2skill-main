import { Router } from "express";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({
    service: "wayfinder-server",
    status: "ok",
    realtimeTransport: "sse-or-conditional-polling",
    mongoConnection: "configured via process.env.MONGODB_URI",
  });
});

export default router;
