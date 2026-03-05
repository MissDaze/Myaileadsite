import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { requireAuth } from "../middleware/auth";

const router = Router();
const prisma = new PrismaClient();

// GET /api/analytics
router.get("/", requireAuth, async (_req: Request, res: Response): Promise<void> => {
  const [
    totalLeads,
    smsSent,
    positiveReplies,
    negativeReplies,
    neutralReplies,
    buildQueued,
    building,
    buildComplete,
    buildFailed,
    deployed,
    followupSent,
    excluded,
    stageCounts,
    recentJobs,
  ] = await Promise.all([
    prisma.lead.count(),
    prisma.lead.count({ where: { sms_sent: true } }),
    prisma.lead.count({ where: { intent: "POSITIVE" } }),
    prisma.lead.count({ where: { intent: "NEGATIVE" } }),
    prisma.lead.count({ where: { intent: "NEUTRAL", sms_sent: true } }),
    prisma.lead.count({ where: { build_status: "QUEUED" } }),
    prisma.lead.count({ where: { build_status: "BUILDING" } }),
    prisma.lead.count({ where: { build_status: "COMPLETE" } }),
    prisma.lead.count({ where: { build_status: "FAILED" } }),
    prisma.lead.count({ where: { site_url: { not: null } } }),
    prisma.lead.count({ where: { followup_sms_sent: true } }),
    prisma.lead.count({ where: { excluded: true } }),
    prisma.lead.groupBy({
      by: ["pipeline_stage"],
      _count: { id: true },
    }),
    prisma.scrapeJob.findMany({
      orderBy: { created_at: "desc" },
      take: 5,
      select: {
        id: true,
        query: true,
        location: true,
        status: true,
        lead_count: true,
        created_at: true,
      },
    }),
  ]);

  const stageMap: Record<string, number> = {};
  for (const row of stageCounts) {
    stageMap[row.pipeline_stage] = row._count.id;
  }

  const funnel = [
    { stage: "SCRAPED", count: stageMap["SCRAPED"] ?? 0 },
    { stage: "SMS_SENT", count: smsSent },
    { stage: "REPLIED_POSITIVE", count: positiveReplies },
    { stage: "BUILDING", count: stageMap["BUILDING"] ?? 0 },
    { stage: "DEPLOYED", count: stageMap["DEPLOYED"] ?? 0 },
    { stage: "FOLLOWUP_SENT", count: stageMap["FOLLOWUP_SENT"] ?? 0 },
    { stage: "INVOICED", count: stageMap["INVOICED"] ?? 0 },
    { stage: "CLOSED_WON", count: stageMap["CLOSED_WON"] ?? 0 },
    { stage: "CLOSED_LOST", count: negativeReplies },
  ];

  const conversionRate =
    smsSent > 0 ? ((positiveReplies / smsSent) * 100).toFixed(1) : "0.0";

  const deployRate =
    positiveReplies > 0 ? ((deployed / positiveReplies) * 100).toFixed(1) : "0.0";

  res.json({
    overview: {
      total_leads: totalLeads,
      sms_sent: smsSent,
      positive_replies: positiveReplies,
      negative_replies: negativeReplies,
      neutral_replies: neutralReplies,
      build_queued: buildQueued,
      building,
      build_complete: buildComplete,
      build_failed: buildFailed,
      deployed,
      followup_sent: followupSent,
      excluded,
    },
    pipeline_stages: stageMap,
    funnel,
    conversion_rate_pct: conversionRate,
    deploy_rate_pct: deployRate,
    recent_scrape_jobs: recentJobs,
  });
});

export default router;
