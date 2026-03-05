import { Router, Request, Response } from "express";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { requireAuth } from "../middleware/auth";

const router = Router();
const prisma = new PrismaClient();

const CRM_PIPELINE_STAGES = [
  "REPLIED_POSITIVE",
  "BUILDING",
  "DEPLOYED",
  "FOLLOWUP_SENT",
  "INVOICED",
  "CLOSED_WON",
  "CLOSED_LOST",
];

// GET /api/crm/leads – leads in CRM-relevant pipeline stages
router.get("/leads", requireAuth, async (_req: Request, res: Response): Promise<void> => {
  const leads = await prisma.lead.findMany({
    where: {
      pipeline_stage: { in: CRM_PIPELINE_STAGES },
    },
    orderBy: { updated_at: "desc" },
    include: {
      scrape_job: { select: { query: true, location: true } },
    },
  });

  res.json({ leads });
});

const leadIdSchema = z.string().cuid();

// POST /api/crm/leads/:id/invoiced
router.post("/leads/:id/invoiced", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const parsed = leadIdSchema.safeParse(req.params.id);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid lead ID" });
    return;
  }

  const lead = await prisma.lead.findUnique({ where: { id: parsed.data } });
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  const updated = await prisma.lead.update({
    where: { id: parsed.data },
    data: { pipeline_stage: "INVOICED" },
  });

  res.json({ lead: updated });
});

// POST /api/crm/leads/:id/won
router.post("/leads/:id/won", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const parsed = leadIdSchema.safeParse(req.params.id);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid lead ID" });
    return;
  }

  const lead = await prisma.lead.findUnique({ where: { id: parsed.data } });
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  const updated = await prisma.lead.update({
    where: { id: parsed.data },
    data: { pipeline_stage: "CLOSED_WON" },
  });

  res.json({ lead: updated });
});

// POST /api/crm/leads/:id/lost
router.post("/leads/:id/lost", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const parsed = leadIdSchema.safeParse(req.params.id);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid lead ID" });
    return;
  }

  const lead = await prisma.lead.findUnique({ where: { id: parsed.data } });
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  const updated = await prisma.lead.update({
    where: { id: parsed.data },
    data: { pipeline_stage: "CLOSED_LOST" },
  });

  res.json({ lead: updated });
});

export default router;
