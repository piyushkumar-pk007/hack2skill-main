import type { RequestHandler } from "express";
import { Types } from "mongoose";
import { notFound } from "../lib/errors.js";
import { TripModel } from "../models/index.js";

export const requireOwnedTripDocument: RequestHandler = async (req, _res, next) => {
  const userId = req.auth?.userId;
  const tripId = String(req.params.id);

  if (!userId || !Types.ObjectId.isValid(tripId)) {
    next(notFound("Trip not found."));
    return;
  }

  const trip = await TripModel.findOne({
    _id: new Types.ObjectId(tripId),
    userId: new Types.ObjectId(userId),
  });

  if (!trip) {
    next(notFound("Trip not found."));
    return;
  }

  req.tripDocument = trip as unknown as typeof req.tripDocument;
  next();
};
