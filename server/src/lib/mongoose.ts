import dns from "node:dns";
import mongoose from "mongoose";
import { getMongoUri } from "../config/env.js";

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var mongooseCache: MongooseCache | undefined;
}

const globalCache = globalThis as typeof globalThis & {
  mongooseCache?: MongooseCache;
};

const cache = globalCache.mongooseCache ?? {
  conn: null,
  promise: null,
};

globalCache.mongooseCache = cache;
mongoose.set("strictQuery", true);
mongoose.set("sanitizeFilter", true);

function configureDnsForSrv(uri: string): void {
  if (!uri.startsWith("mongodb+srv://")) {
    return;
  }

  dns.setServers(["1.1.1.1", "8.8.8.8"]);
}

export async function connectToDatabase(): Promise<typeof mongoose> {
  if (cache.conn) {
    return cache.conn;
  }

  if (!cache.promise) {
    const mongoUri = getMongoUri();
    configureDnsForSrv(mongoUri);

    cache.promise = mongoose.connect(mongoUri, {
      bufferCommands: false,
    });
  }

  cache.conn = await cache.promise;
  return cache.conn;
}
