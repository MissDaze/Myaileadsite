import { Router, Request, Response } from "express";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { requireAuth } from "../middleware/auth";
import { scrapeBusinesses } from "../services/outscraper";
import { normalisePhone } from "../lib/phone";

const router = Router();
const prisma = new PrismaClient();

const createJobSchema = z.object({
  query: z.string().min(1),
  location: z.string().min(1),
});

// POST /api/scrape-jobs
router.post("/", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const parsed = createJobSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.errors });
    return;
  }

  const { query, location } = parsed.data;

  // Create job with PENDING status
  const job = await prisma.scrapeJob.create({
    data: { query, location, status: "PENDING" },
  });

  // Run scrape asynchronously
  runScrape(job.id, query, location).catch((err) => {
    console.error(`[ScrapeJob ${job.id}] Scrape failed:`, err.message);
  });

  res.status(201).json(job);
});

async function runScrape(jobId: string, query: string, location: string): Promise<void> {
  await prisma.scrapeJob.update({
    where: { id: jobId },
    data: { status: "RUNNING" },
  });

  try {
    const businesses = await scrapeBusinesses(query, location);

    let count = 0;
    for (const biz of businesses) {
      if (!biz.phone) continue;

      const normalisedPhone = normalisePhone(biz.phone);
      if (!normalisedPhone) continue;

      try {
        await prisma.lead.upsert({
          where: {
            phone_scrape_job_id: {
              phone: normalisedPhone,
              scrape_job_id: jobId,
            },
          },
          update: {
            business_name: biz.business_name,
            address: biz.address,
            category: biz.category,
            rating: biz.rating,
            review_count: biz.review_count,
            maps_url: biz.maps_url,
            maps_overview_url: biz.maps_overview_url,
            maps_reviews_url: biz.maps_reviews_url,
            maps_photos_url: biz.maps_photos_url,
            hours: biz.hours,
          },
          create: {
            scrape_job_id: jobId,
            business_name: biz.business_name,
            phone: normalisedPhone,
            address: biz.address,
            category: biz.category,
            rating: biz.rating,
            review_count: biz.review_count,
            maps_url: biz.maps_url,
            maps_overview_url: biz.maps_overview_url,
            maps_reviews_url: biz.maps_reviews_url,
            maps_photos_url: biz.maps_photos_url,
            hours: biz.hours,
          },
        });
        count++;
      } catch (err) {
        console.warn(`[ScrapeJob ${jobId}] Failed to upsert lead ${biz.phone}:`, err);
      }
    }

    await prisma.scrapeJob.update({
      where: { id: jobId },
      data: { status: "DONE", lead_count: count },
    });

    console.log(`[ScrapeJob ${jobId}] Done. ${count} leads stored.`);
  } catch (err) {
    await prisma.scrapeJob.update({
      where: { id: jobId },
      data: { status: "FAILED" },
    });
    throw err;
  }
}

// GET /api/scrape-jobs
router.get("/", requireAuth, async (_req: Request, res: Response): Promise<void> => {
  const jobs = await prisma.scrapeJob.findMany({
    orderBy: { created_at: "desc" },
    include: {
      _count: { select: { leads: true } },
    },
  });
  res.json(jobs);
});

const getLeadsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  intent: z.enum(["POSITIVE", "NEGATIVE", "NEUTRAL"]).optional(),
  excluded: z.enum(["true", "false"]).optional(),
  sortBy: z.enum(["created_at", "business_name", "rating", "review_count"]).default("created_at"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

// GET /api/scrape-jobs/:id/leads
router.get("/:id/leads", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  const parsed = getLeadsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query params", details: parsed.error.errors });
    return;
  }

  const { page, limit, intent, excluded, sortBy, sortOrder } = parsed.data;

  const where: Record<string, unknown> = { scrape_job_id: id };
  if (intent) where["intent"] = intent;
  if (excluded !== undefined) where["excluded"] = excluded === "true";

  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.lead.count({ where }),
  ]);

  res.json({
    data: leads,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

export default router;
