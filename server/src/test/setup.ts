import mongoose from "mongoose";
import { afterEach, beforeAll } from "vitest";

beforeAll(async () => {
  if (mongoose.connection.readyState === 1) return;
  const uri = process.env.MONGODB_URI;
  if (!uri) return;
  await mongoose.connect(uri, { bufferCommands: false });
});

afterEach(async () => {
  if (mongoose.connection.readyState !== 1) return;
  const { collections } = mongoose.connection;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
});
