import dotenv from "dotenv";
import { createApp } from "./app.js";
import { connectDatabase } from "./db.js";

dotenv.config();

const app = createApp();
const port = process.env.PORT || 5050;

connectDatabase()
  .then(() => {
    app.listen(port, () => {
      console.log(`API listening on http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
  });
