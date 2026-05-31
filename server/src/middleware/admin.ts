import type { RequestHandler } from "express";
import { env } from "../config/env.js";
import { forbidden } from "../lib/errors.js";

export const requireAdminApiKey: RequestHandler = (req, _res, next) => {
  if (!env.adminApiKey) {
    next();
    return;
  }

  const providedKey = req.header("x-admin-key");
  if (providedKey !== env.adminApiKey) {
    next(forbidden("Admin API key is required for simulated event injection."));
    return;
  }

  next();
};
