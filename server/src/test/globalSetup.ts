import { MongoMemoryServer } from "mongodb-memory-server";

let mongod: MongoMemoryServer;

export async function setup() {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.VITEST = "true";
  // Disable the replan debounce so integration tests can replan immediately.
  process.env.REPLAN_DEBOUNCE_MS = "0";
}

export async function teardown() {
  await mongod?.stop();
}
