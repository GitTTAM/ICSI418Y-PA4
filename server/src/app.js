import cors from "cors";
import express from "express";
import authRoutes from "./routes/auth.js";
import projectRoutes from "./routes/projects.js";
import storyRoutes from "./routes/stories.js";
import userRoutes from "./routes/users.js";

export function createApp() {
  const app = express();
  const clientUrls = [
    ...(process.env.CLIENT_URL || "").split(","),
    "http://localhost:5173",
    "http://127.0.0.1:5173"
  ].map((url) => url.trim()).filter(Boolean);

  app.use(cors({
    origin(origin, callback) {
      if (!origin || clientUrls.includes(origin)) return callback(null, true);
      const error = new Error("Origin is not allowed by CORS.");
      error.status = 403;
      callback(error);
    }
  }));
  app.use(express.json());
  app.get("/api/health", (request, response) => response.json({ message: "API is running." }));
  app.use("/api", authRoutes);
  app.use("/api", userRoutes);
  app.use("/api", projectRoutes);
  app.use("/api", storyRoutes);
  app.use((error, request, response, next) => {
    const status = error.status || 500;
    response.status(status).json({
      message: status === 400 ? "Send valid JSON in the request body."
        : status === 403 ? "Origin is not allowed by CORS."
        : "Could not complete the request right now."
    });
  });
  return app;
}
