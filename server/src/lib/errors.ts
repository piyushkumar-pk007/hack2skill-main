export class AppError extends Error {
  statusCode: number;
  code: string;
  expose: boolean;
  details?: unknown;

  constructor(statusCode: number, message: string, options?: { code?: string; expose?: boolean; details?: unknown }) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = options?.code ?? "app_error";
    this.expose = options?.expose ?? statusCode < 500;
    this.details = options?.details;
  }
}

export function badRequest(message: string, details?: unknown) {
  return new AppError(400, message, { code: "bad_request", details });
}

export function unauthorized(message = "Authentication required.") {
  return new AppError(401, message, { code: "unauthorized" });
}

export function forbidden(message = "You do not have access to this resource.") {
  return new AppError(403, message, { code: "forbidden" });
}

export function notFound(message = "Resource not found.") {
  return new AppError(404, message, { code: "not_found" });
}

export function tooManyRequests(message = "Too many requests. Please try again later.") {
  return new AppError(429, message, { code: "too_many_requests" });
}
