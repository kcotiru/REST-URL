import dotenv from "dotenv";
dotenv.config();

import { connectDB } from "./config/database";
import createApp from "./app";

const PORT = Number(process.env.PORT) || 3000;

const start = async (): Promise<void> => {
  await connectDB();

  const app = createApp();

  const server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`NODE_ENV: ${process.env.NODE_ENV || "development"}`);
  });

  // ── Graceful shutdown ──────────────────────────────────────────────────────
  const shutdown = (signal: string) => {
    console.log(`\n${signal} received — shutting down...`);
    server.close(() => {
      console.log("HTTP server closed");
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
};

start().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
