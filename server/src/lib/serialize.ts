import { Types } from "mongoose";

export function serializeForApi<T>(input: T): unknown {
  if (input instanceof Date) {
    return input.toISOString();
  }

  if (input instanceof Types.ObjectId) {
    return input.toString();
  }

  if (Array.isArray(input)) {
    return input.map((value) => serializeForApi(value));
  }

  if (input && typeof input === "object") {
    const plain =
      "toObject" in input && typeof input.toObject === "function"
        ? input.toObject({ depopulate: false, versionKey: false, virtuals: false })
        : input;

    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(plain)) {
      if (key === "__v") {
        continue;
      }

      if (key === "_id") {
        result.id = serializeForApi(value);
        continue;
      }

      result[key] = serializeForApi(value);
    }

    return result;
  }

  return input;
}
