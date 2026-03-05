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
    buildComplete,
    deployed,
    stageCounts,
    categoryCounts,
  ] = await Promise.all([
    prisma.lead.count(),
    prisma.lead.count({ where: { sms_sent: true } }),
    prisma.lead.count({ where: { intent: "POSITIVE" } }),
    prisma.lead.count({ where: { build_status: "COMPLETE" } }),
    prisma.lead.count({ where: { site_url: { not: null } } }),
    prisma.lead.groupBy({
      by: ["pipeline_stage"],
      _count: { id: true },
    }),
    prisma.lead.groupBy({
      by: ["category"],
      _count: { id: true },
      where: { category: { not: null } },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    }),
  ]);

  // Leads with any reply
  const replyCount = await prisma.lead.count({
    where: { reply_text: { not: null }, sms_sent: true },
  });

  // Build attempts
  const buildAttempts = await prisma.lead.count({
    where: { build_status: { in: ["QUEUED", "BUILDING", "COMPLETE", "FAILED"] } },
  });

  // Leads over time – last 30 days grouped by day
  const leadsOverTime = await prisma.$queryRaw<Array<{ date: string; count: number }>>`
    SELECT TO_CHAR(DATE_TRUNC('day', created_at), 'YYYY-MM-DD') AS date,
           COUNT(*)::int AS count
    FROM "Lead"
    WHERE created_at >= NOW() - INTERVAL '30 days'
    GROUP BY DATE_TRUNC('day', created_at)
    ORDER BY DATE_TRUNC('day', created_at) ASC
  `;

  const stageMap: Record<string, number> = {};
  for (const row of stageCounts) {
    stageMap[row.pipeline_stage] = row._count.id;
  }

  const pipelineFunnel = [
    "SCRAPED",
    "SMS_SENT",
    "REPLIED_POSITIVE",
    "BUILDING",
    "DEPLOYED",
    "FOLLOWUP_SENT",
    "INVOICED",
    "CLOSED_WON",
    "CLOSED_LOST",
  ].map((stage) => ({ stage, count: stageMap[stage] ?? 0 }));

  const leadsByCategory = categoryCounts.map((row) => ({
    category: row.category ?? "Unknown",
    count: row._count.id,
  }));

  res.json({
    total_leads: totalLeads,
    sms_sent_count: smsSent,
    sms_sent_rate: totalLeads > 0 ? smsSent / totalLeads : 0,
    reply_count: replyCount,
    response_rate: smsSent > 0 ? replyCount / smsSent : 0,
    positive_count: positiveReplies,
    positive_rate: replyCount > 0 ? positiveReplies / replyCount : 0,
    build_success_count: buildComplete,
    build_success_rate: buildAttempts > 0 ? buildComplete / buildAttempts : 0,
    deployment_count: deployed,
    deployment_rate: positiveReplies > 0 ? deployed / positiveReplies : 0,
    pipeline_funnel: pipelineFunnel,
    leads_by_category: leadsByCategory,
    leads_over_time: leadsOverTime,
  });
});

export default router;
