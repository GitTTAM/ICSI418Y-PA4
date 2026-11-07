import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import { seedDemoData } from "../src/demoData.js";

// Browser tests use a disposable database. Never load server/.env here.
const database = await MongoMemoryServer.create();
await mongoose.connect(database.getUri());
await seedDemoData();
process.env.CLIENT_URL = "http://127.0.0.1:5174";
const server = createApp().listen(5051, "127.0.0.1");
console.log("Browser test API listening on http://127.0.0.1:5051");
async function stop() {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await database.stop();
  process.exit(0);
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
