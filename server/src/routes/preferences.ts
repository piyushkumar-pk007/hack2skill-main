import { Router } from "express";
import { asyncRoute } from "../lib/async-route.js";
import { notFound } from "../lib/errors.js";
import { sendConditionalJson } from "../lib/http-cache.js";
import { serializeForApi } from "../lib/serialize.js";
import { requireAuth } from "../middleware/auth.js";
import { writeRateLimiter } from "../middleware/rate-limit.js";
import { validateRequest } from "../middleware/validate.js";
import { UserModel } from "../models/index.js";
import { preferencesBodySchema } from "../validators/common.js";

const preferencesRouter = Router();

preferencesRouter.get(
  "/preferences",
  requireAuth,
  asyncRoute(async (req, res) => {
    const user = await UserModel.findById(req.auth!.userId, { preferences: 1, updatedAt: 1 }).lean();

    if (!user) {
      throw notFound("User not found.");
    }

    const payload = {
      userId: String(user._id),
      preferences: serializeForApi(user.preferences),
      updatedAt: serializeForApi(user.updatedAt),
    };

    sendConditionalJson(req, res, payload, {
      cacheControl: "private, max-age=0, must-revalidate",
      etagSeed: user.updatedAt instanceof Date ? user.updatedAt.toISOString() : String(user._id),
    });
  })
);

preferencesRouter.put(
  "/preferences",
  requireAuth,
  writeRateLimiter,
  validateRequest({ body: preferencesBodySchema }),
  asyncRoute(async (req, res) => {
    const user = await UserModel.findByIdAndUpdate(
      req.auth!.userId,
      { $set: { preferences: req.body.preferences } },
      { new: true, projection: { preferences: 1, updatedAt: 1 } }
    ).lean();

    if (!user) {
      throw notFound("User not found.");
    }

    sendConditionalJson(
      req,
      res,
      {
        userId: String(user._id),
        preferences: serializeForApi(user.preferences),
        updatedAt: serializeForApi(user.updatedAt),
        tripSnapshotsUpdated: false,
      },
      {
        cacheControl: "private, no-store",
      }
    );
  })
);

export default preferencesRouter;
