import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";

import authRouter from "./routes/auth";
import scrapeJobsRouter from "./routes/scrape-jobs";
import leadsRouter from "./routes/leads";
import smsRouter from "./routes/sms";
import webhookRouter from "./routes/webhook";
import buildRouter from "./routes/build";
import deployRouter from "./routes/deploy";
import analyticsRouter from "./routes/analytics";
import outreachRouter from "./routes/outreach";
import crmRouter from "./routes/crm";

const app = express();
const PORT = process.env.PORT ?? 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

// Health check (no rate limit needed)
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Routes
app.use("/api/auth", authLimiter, authRouter);
app.use("/api/scrape-jobs", apiLimiter, scrapeJobsRouter);
app.use("/api/leads", apiLimiter, leadsRouter);
app.use("/api/sms", apiLimiter, smsRouter);
app.use("/api/webhook", webhookLimiter, webhookRouter);
app.use("/api/build", apiLimiter, buildRouter);
app.use("/api/deploy", apiLimiter, deployRouter);
app.use("/api/deployments", apiLimiter, deployRouter);
app.use("/api/analytics", apiLimiter, analyticsRouter);
app.use("/api/outreach", apiLimiter, outreachRouter);
app.use("/api/crm", apiLimiter, crmRouter);

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
