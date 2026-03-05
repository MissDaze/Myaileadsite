import { Router, Request, Response } from "express";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { requireAuth } from "../middleware/auth";
import { buildQueue, enqueueBuildJob } from "../lib/queue";

const router = Router();
const prisma = new PrismaClient();

// GET /api/build/queue
router.get("/queue", requireAuth, async (_req: Request, res: Response): Promise<void> => {
  const [waiting, active, completed, failed] = await Promise.all([
    buildQueue.getJobs(["waiting"]),
    buildQueue.getJobs(["active"]),
    buildQueue.getJobs(["completed"], 0, 49),
    buildQueue.getJobs(["failed"], 0, 49),
  ]);

  const formatJob = (job: { id?: string; name: string; data: unknown; timestamp: number; processedOn?: number; finishedOn?: number; failedReason?: string }) => ({
    id: job.id,
    name: job.name,
    data: job.data,
    createdAt: new Date(job.timestamp).toISOString(),
    processedAt: job.processedOn ? new Date(job.processedOn).toISOString() : null,
    finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
    failedReason: job.failedReason ?? null,
  });

  res.json({
    waiting: waiting.map(formatJob),
    active: active.map(formatJob),
    completed: completed.map(formatJob),
    failed: failed.map(formatJob),
    counts: {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
    },
  });
});

// GET /api/build/:leadId/log  (SSE stream)
router.get("/:leadId/log", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const leadId = req.params["leadId"] as string;

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  // Set up SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // Send current log immediately
  const sendLog = async () => {
    const current = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { build_log: true, build_status: true },
    });

    if (current) {
      res.write(`data: ${JSON.stringify({ log: current.build_log ?? "", status: current.build_status })}\n\n`);
    }
  };

  await sendLog();

  // Poll every 2 seconds for updates
  const interval = setInterval(async () => {
    try {
      const current = await prisma.lead.findUnique({
        where: { id: leadId },
        select: { build_log: true, build_status: true },
      });

      if (current) {
        res.write(`data: ${JSON.stringify({ log: current.build_log ?? "", status: current.build_status })}\n\n`);

        // Stop polling if build is in terminal state
        if (current.build_status === "COMPLETE" || current.build_status === "FAILED") {
          clearInterval(interval);
          res.write("event: done\ndata: {}\n\n");
          res.end();
        }
      }
    } catch {
      clearInterval(interval);
      res.end();
    }
  }, 2000);

  // Clean up on client disconnect
  req.on("close", () => {
    clearInterval(interval);
  });
});

const triggerDeploySchema = z.object({
  leadId: z.string().cuid(),
});

// POST /api/deploy/:leadId
router.post("/:leadId/deploy", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const parsed = triggerDeploySchema.safeParse({ leadId: req.params["leadId"] });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid leadId" });
    return;
  }

  const leadId = parsed.data.leadId;

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  if (lead.build_status === "BUILDING" || lead.build_status === "QUEUED") {
    res.status(409).json({ error: "Build already in progress" });
    return;
  }

  // Reset and re-queue
  await prisma.lead.update({
    where: { id: leadId },
    data: { build_status: "QUEUED", build_log: null },
  });

  await enqueueBuildJob(leadId);

  res.json({ message: "Deploy triggered", leadId });
});

export default router;
