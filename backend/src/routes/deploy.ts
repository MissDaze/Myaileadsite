import { Router, Request, Response } from "express";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { requireAuth } from "../middleware/auth";
import { enqueueBuildJob } from "../lib/queue";

const router = Router();
const prisma = new PrismaClient();

// GET /api/deployments
router.get("/", requireAuth, async (_req: Request, res: Response): Promise<void> => {
  const deployed = await prisma.lead.findMany({
    where: {
      build_status: "COMPLETE",
      site_url: { not: null },
    },
    orderBy: { updated_at: "desc" },
    select: {
      id: true,
      business_name: true,
      phone: true,
      category: true,
      site_url: true,
      github_repo_url: true,
      pipeline_stage: true,
      followup_sms_sent: true,
      created_at: true,
      updated_at: true,
      scrape_job: { select: { query: true, location: true } },
    },
  });

  res.json({ deployments: deployed });
});

// POST /api/deploy/:leadId – manually trigger deploy for a lead
router.post("/:leadId", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const idSchema = z.string().cuid();
  const parsed = idSchema.safeParse(req.params["leadId"]);

  if (!parsed.success) {
    res.status(400).json({ error: "Invalid leadId" });
    return;
  }

  const leadId = parsed.data;
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });

  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  if (lead.build_status === "BUILDING" || lead.build_status === "QUEUED") {
    res.status(409).json({ error: "Build already in progress" });
    return;
  }

  await prisma.lead.update({
    where: { id: leadId },
    data: { build_status: "QUEUED", build_log: null },
  });

  await enqueueBuildJob(leadId);

  res.json({ message: "Deploy triggered", leadId });
});

export default router;
