import { Router } from "express";
import { env } from "../config/env.js";
import { asyncRoute } from "../lib/async-route.js";
import { unauthorized } from "../lib/errors.js";
import { requireRefreshAuth } from "../middleware/auth.js";
import { authRateLimiter, writeRateLimiter } from "../middleware/rate-limit.js";
import { validateRequest } from "../middleware/validate.js";
import { authenticateUser, issueSession, refreshSession, registerUser, revokeRefreshSession } from "../services/auth.service.js";
import { loginBodySchema, registerBodySchema } from "../validators/common.js";

const authRouter = Router();

authRouter.post(
  "/register",
  authRateLimiter,
  validateRequest({ body: registerBodySchema }),
  asyncRoute(async (req, res) => {
    const user = await registerUser(req.body);
    const session = await issueSession(user, res);

    res.setHeader("Cache-Control", "no-store");
    res.status(201).json(session);
  })
);

authRouter.post(
  "/login",
  authRateLimiter,
  validateRequest({ body: loginBodySchema }),
  asyncRoute(async (req, res) => {
    const user = await authenticateUser(req.body.email, req.body.password);
    const session = await issueSession(user, res);

    res.setHeader("Cache-Control", "no-store");
    res.json(session);
  })
);

authRouter.post(
  "/refresh",
  authRateLimiter,
  requireRefreshAuth,
  asyncRoute(async (req, res) => {
    const refreshToken = req.cookies?.[env.refreshCookieName];
    if (typeof refreshToken !== "string") {
      throw unauthorized("Refresh session not available.");
    }

    const session = await refreshSession(req.auth!.userId, refreshToken, res);
    res.setHeader("Cache-Control", "no-store");
    res.json(session);
  })
);

authRouter.post(
  "/logout",
  writeRateLimiter,
  requireRefreshAuth,
  asyncRoute(async (req, res) => {
    await revokeRefreshSession(req.auth!.userId, res);
    res.status(204).end();
  })
);

export default authRouter;
