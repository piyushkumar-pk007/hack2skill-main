import type { ErrorRequestHandler, RequestHandler } from "express";
import { env } from "../config/env.js";
import { AppError, notFound } from "../lib/errors.js";

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(notFound("Route not found."));
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  void next;
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      message: error.message,
      code: error.code,
      ...(error.details ? { details: error.details } : {}),
      ...(!env.isProduction && error.stack ? { stack: error.stack } : {}),
    });
    return;
  }

  if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
    res.status(409).json({
      message: "Unable to complete the request with the provided data.",
      code: "duplicate_key",
    });
    return;
  }

  console.error(error);

  res.status(500).json({
    message: env.isProduction ? "Internal server error." : error instanceof Error ? error.message : "Internal server error.",
    code: "internal_server_error",
    ...(!env.isProduction && error instanceof Error && error.stack ? { stack: error.stack } : {}),
  });
};
