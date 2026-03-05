import { Router, Request, Response } from "express";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { requireAuth } from "../middleware/auth";
import { sendSms, buildFollowUpMessage } from "../services/textmagic";

const router = Router();
const prisma = new PrismaClient();

// GET /api/outreach – leads that have been SMS'd (sent), and those that have replied
router.get("/", requireAuth, async (_req: Request, res: Response): Promise<void> => {
  const [sent, replies] = await Promise.all([
    prisma.lead.findMany({
      where: { sms_sent: true },
      orderBy: { updated_at: "desc" },
    }),
    prisma.lead.findMany({
      where: { sms_sent: true, reply_text: { not: null } },
      orderBy: { updated_at: "desc" },
    }),
  ]);

  res.json({ sent, replies });
});

const followUpParamSchema = z.string().cuid();

// POST /api/outreach/followup/:leadId – send a follow-up SMS for a deployed lead
router.post("/followup/:leadId", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const parsed = followUpParamSchema.safeParse(req.params.leadId);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid leadId" });
    return;
  }

  const lead = await prisma.lead.findUnique({ where: { id: parsed.data } });
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  if (!lead.site_url) {
    res.status(400).json({ error: "Lead does not have a deployed site URL" });
    return;
  }

  const message = buildFollowUpMessage(lead.business_name, lead.site_url);
  await sendSms(lead.phone, message);

  const updated = await prisma.lead.update({
    where: { id: lead.id },
    data: {
      followup_sms_sent: true,
      pipeline_stage: "FOLLOWUP_SENT",
    },
  });

  res.json({ lead: updated });
});

export default router;
