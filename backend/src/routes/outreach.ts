import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { requireAuth } from "../middleware/auth";
import { sendSms, buildFollowUpMessage } from "../services/textmagic";

const router = Router();
const prisma = new PrismaClient();

router.get("/", requireAuth, async (_req: Request, res: Response): Promise<void> => {
  const [sent, replies] = await Promise.all([
    prisma.lead.findMany({
      where: { sms_sent: true },
      orderBy: { updated_at: "desc" },
    }),
    prisma.lead.findMany({
      where: { reply_text: { not: null } },
      orderBy: { updated_at: "desc" },
    }),
  ]);

  res.json({ sent, replies });
});

router.post("/followup/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const id = req.params["id"] as string;
  const lead = await prisma.lead.findUnique({ where: { id } });

  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  if (!lead.site_url) {
    res.status(400).json({ error: "Lead does not have a deployed site" });
    return;
  }

  try {
    await sendSms(lead.phone, buildFollowUpMessage(lead.business_name, lead.site_url));
    const updated = await prisma.lead.update({
      where: { id },
      data: {
        followup_sms_sent: true,
        pipeline_stage: "FOLLOWUP_SENT",
      },
    });
    res.json({ lead: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send follow-up";
    res.status(502).json({ error: message });
  }
});

export default router;
