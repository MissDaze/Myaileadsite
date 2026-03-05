import "dotenv/config";
import express from "express";
import cors from "cors";

import authRouter from "./routes/auth";
import scrapeJobsRouter from "./routes/scrape-jobs";
import leadsRouter from "./routes/leads";
import smsRouter from "./routes/sms";
import webhookRouter from "./routes/webhook";
import buildRouter from "./routes/build";
import deployRouter from "./routes/deploy";
import analyticsRouter from "./routes/analytics";

const app = express();
const PORT = process.env.PORT ?? 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Routes
app.use("/api/auth", authRouter);
app.use("/api/scrape-jobs", scrapeJobsRouter);
app.use("/api/leads", leadsRouter);
app.use("/api/sms", smsRouter);
app.use("/api/webhook", webhookRouter);
app.use("/api/build", buildRouter);
app.use("/api/deploy", deployRouter);
app.use("/api/deployments", deployRouter);
app.use("/api/analytics", analyticsRouter);

// Global error handler
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("[Server] Unhandled error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.listen(PORT, () => {
  console.log(`[Server] LeadForge AI backend running on port ${PORT}`);
});

export default app;
