import dotenv from "dotenv";
import mongoose from "mongoose";
import { connectDatabase } from "../src/db.js";
import { seedDemoData, DEMO_PASSWORD } from "../src/demoData.js";

dotenv.config();
try {
  await connectDatabase();
  const { users, projects } = await seedDemoData();
  console.log(`Ram Ranch demo ready: ${users.length} character accounts and ${projects.length} projects. Existing accounts and custom stories were kept.`);
  console.log("Demo users:", users.map((user) => user.username).join(", "));
  console.log("Password for newly created demo users:", DEMO_PASSWORD);
  console.log("Projects:", projects.map((project) => project.name).join(", "));
} catch {
  console.error("Could not prepare demo data. Check server/.env and MongoDB access.");
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
