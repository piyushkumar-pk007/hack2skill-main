import type { RequestHandler } from "express";
import { connectToDatabase } from "../lib/mongoose.js";

export const ensureDatabaseConnection: RequestHandler = async (_req, _res, next) => {
  await connectToDatabase();
  next();
};
