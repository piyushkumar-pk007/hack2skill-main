import type { RequestHandler } from "express";
import { ZodError, type AnyZodObject } from "zod";
import { badRequest } from "../lib/errors.js";

export function validateRequest(schemas: {
  body?: AnyZodObject;
  params?: AnyZodObject;
  query?: AnyZodObject;
}): RequestHandler {
  return (req, _res, next) => {
    try {
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as typeof req.params;
      }

      if (schemas.query) {
        req.query = schemas.query.parse(req.query) as typeof req.query;
      }

      if (schemas.body) {
        req.body = schemas.body.parse(req.body) as typeof req.body;
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(
          badRequest("Invalid request payload.", {
            issues: error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          })
        );
        return;
      }

      next(error);
    }
  };
}
