import { Router } from "express";
import { asyncRoute } from "../lib/async-route.js";
import { sendConditionalJson } from "../lib/http-cache.js";
import { serializeForApi } from "../lib/serialize.js";
import { validateRequest } from "../middleware/validate.js";
import { ExperienceModel } from "../models/index.js";
import { experiencesQuerySchema } from "../validators/common.js";

const experiencesRouter = Router();

experiencesRouter.get(
  "/experiences",
  validateRequest({ query: experiencesQuerySchema }),
  asyncRoute(async (req, res) => {
    const {
      page,
      pageSize,
      destinationKey,
      category,
      tags,
      maxPrice,
      currency,
      transport,
      accessibleOnly,
      sort,
    } = req.query as unknown as {
      page: number;
      pageSize: number;
      destinationKey?: string;
      category?: string;
      tags?: string[];
      maxPrice?: number;
      currency?: string;
      transport?: string;
      accessibleOnly?: boolean;
      sort: "updatedDesc" | "priceAsc" | "priceDesc" | "durationAsc";
    };

    const filter: Record<string, unknown> = {
      isActive: true,
      ...(destinationKey ? { destinationKey } : {}),
      ...(category ? { category } : {}),
      ...(tags?.length ? { tags: { $all: tags } } : {}),
      ...(typeof maxPrice === "number" ? { "price.amount": { $lte: maxPrice } } : {}),
      ...(currency ? { "price.currency": currency } : {}),
      ...(transport ? { preferredTransportModes: transport } : {}),
      ...(accessibleOnly ? { "accessibility.wheelchairAccessible": true, "accessibility.stepFree": true } : {}),
    };

    const sortMap = {
      updatedDesc: { updatedAt: -1 },
      priceAsc: { "price.amount": 1, updatedAt: -1 },
      priceDesc: { "price.amount": -1, updatedAt: -1 },
      durationAsc: { durationMinutes: 1, updatedAt: -1 },
    } as const;

    // Verify index usage locally if needed:
    // await ExperienceModel.find(filter).sort(sortMap[sort]).explain("executionStats");
    const [rows, total] = await Promise.all([
      ExperienceModel.find(
        filter,
        {
          title: 1,
          slug: 1,
          category: 1,
          destinationKey: 1,
          location: 1,
          summary: 1,
          price: 1,
          durationMinutes: 1,
          tags: 1,
          accessibility: 1,
          preferredTransportModes: 1,
          updatedAt: 1,
        }
      )
        .sort(sortMap[sort])
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      ExperienceModel.countDocuments(filter),
    ]);

    sendConditionalJson(
      req,
      res,
      {
        page,
        pageSize,
        total,
        items: serializeForApi(rows),
      },
      {
        cacheControl: "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
        etagSeed: `${page}:${pageSize}:${total}`,
      }
    );
  })
);

export default experiencesRouter;
