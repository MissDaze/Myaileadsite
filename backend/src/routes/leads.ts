import { Router, Request, Response } from "express";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { requireAuth } from "../middleware/auth";

const router = Router();
const prisma = new PrismaClient();

const listLeadsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  intent: z.enum(["POSITIVE", "NEGATIVE", "NEUTRAL"]).optional(),
  build_status: z
    .enum(["NOT_STARTED", "QUEUED", "BUILDING", "COMPLETE", "FAILED"])
    .optional(),
  pipeline_stage: z
    .enum([
      "SCRAPED",
      "SMS_SENT",
      "REPLIED_POSITIVE",
      "BUILDING",
      "DEPLOYED",
      "FOLLOWUP_SENT",
      "INVOICED",
      "CLOSED_WON",
      "CLOSED_LOST",
    ])
    .optional(),
  excluded: z.enum(["true", "false"]).optional(),
  sortBy: z
    .enum(["created_at", "business_name", "rating", "review_count", "updated_at"])
    .default("created_at"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

// GET /api/leads
router.get("/", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const parsed = listLeadsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query params", details: parsed.error.errors });
    return;
  }

  const { page, limit, intent, build_status, pipeline_stage, excluded, sortBy, sortOrder } =
    parsed.data;

  const where: Record<string, unknown> = {};
  if (intent) where["intent"] = intent;
  if (build_status) where["build_status"] = build_status;
  if (pipeline_stage) where["pipeline_stage"] = pipeline_stage;
  if (excluded !== undefined) where["excluded"] = excluded === "true";

  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        scrape_job: { select: { query: true, location: true } },
      },
    }),
    prisma.lead.count({ where }),
  ]);

  res.json({
    leads,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

const updateLeadSchema = z.object({
  excluded: z.boolean().optional(),
  pipeline_stage: z
    .enum([
      "SCRAPED",
      "SMS_SENT",
      "REPLIED_POSITIVE",
      "BUILDING",
      "DEPLOYED",
      "FOLLOWUP_SENT",
      "INVOICED",
      "CLOSED_WON",
      "CLOSED_LOST",
    ])
    .optional(),
  intent: z.enum(["POSITIVE", "NEGATIVE", "NEUTRAL"]).optional(),
  build_status: z
    .enum(["NOT_STARTED", "QUEUED", "BUILDING", "COMPLETE", "FAILED"])
    .optional(),
  site_url: z.string().url().optional(),
  github_repo_url: z.string().url().optional(),
  reply_text: z.string().optional(),
});

// PATCH /api/leads/:id
router.patch("/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const id = req.params["id"] as string;

  const parsed = updateLeadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.errors });
    return;
  }

  const lead = await prisma.lead.findUnique({ where: { id: id } });
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  const updated = await prisma.lead.update({
    where: { id: id },
    data: parsed.data,
  });

  res.json(updated);
});

const bulkExcludeSchema = z.object({
  ids: z.array(z.string().cuid()).min(1),
});

// POST /api/leads/bulk-exclude
router.post("/bulk-exclude", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const parsed = bulkExcludeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.errors });
    return;
  }

  const { ids } = parsed.data;

  const result = await prisma.lead.updateMany({
    where: { id: { in: ids } },
    data: { excluded: true },
  });

  res.json({ updated: result.count });
});

export default router;
