import mongoose from "mongoose";
import { beforeAll } from "vitest";

// Set BEFORE any app modules are imported so env.ts picks up the test value.
// setupFiles module-level code runs before the test file's imports are resolved.
process.env.REPLAN_DEBOUNCE_MS = "0";

beforeAll(async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) return;

  // Connect if not already connected (each vmFork VM context gets a fresh mongoose instance).
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(uri, { bufferCommands: false });
  }

  // Wipe all collections once at the START of each test file so files start clean
  // without interfering with each other. Tests within a file accumulate state freely
  // (all use unique identifiers like timestamped emails to avoid intra-file conflicts).
  const { collections } = mongoose.connection;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
});
