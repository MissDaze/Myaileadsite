import { Router, Request, Response } from "express";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { requireAuth } from "../middleware/auth";
import { enqueueBuildJob } from "../lib/queue";

const router = Router();
const prisma = new PrismaClient();

// GET /api/build/queue – returns leads with active or past build states
router.get("/queue", requireAuth, async (_req: Request, res: Response): Promise<void> => {
  const builds = await prisma.lead.findMany({
    where: {
      build_status: { in: ["QUEUED", "BUILDING", "COMPLETE", "FAILED"] },
    },
    orderBy: { updated_at: "desc" },
    include: {
      scrape_job: { select: { query: true, location: true } },
    },
  });

  res.json({ builds });
});

const bulkBuildSchema = z.object({
  lead_ids: z.array(z.string().cuid()).min(1),
});

// POST /api/build/queue – bulk-enqueue builds
router.post("/queue", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const parsed = bulkBuildSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.errors });
    return;
  }

  const { lead_ids } = parsed.data;

  const leads = await prisma.lead.findMany({
    where: {
      id: { in: lead_ids },
      excluded: false,
      build_status: { notIn: ["QUEUED", "BUILDING"] },
    },
  });

  let queued = 0;
  for (const lead of leads) {
    await prisma.lead.update({
      where: { id: lead.id },
      data: { build_status: "QUEUED", build_log: null },
    });
    await enqueueBuildJob(lead.id);
    queued++;
  }

  res.json({ queued });
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
