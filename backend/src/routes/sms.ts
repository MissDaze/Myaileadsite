import { Router, Request, Response } from "express";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { requireAuth } from "../middleware/auth";
import { sendSms, buildLeadSmsMessage } from "../services/textmagic";

const router = Router();
const prisma = new PrismaClient();

const sendBulkSchema = z.object({
  lead_ids: z.array(z.string().cuid()).min(1),
});

// POST /api/sms/send-bulk
router.post("/send-bulk", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const parsed = sendBulkSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.errors });
    return;
  }

  const { lead_ids } = parsed.data;

  const leads = await prisma.lead.findMany({
    where: {
      id: { in: lead_ids },
      excluded: false,
      sms_sent: false,
    },
  });

  const results: Array<{ leadId: string; success: boolean; error?: string }> = [];

  for (const lead of leads) {
    try {
      const message = buildLeadSmsMessage(lead.business_name);
      await sendSms(lead.phone, message);

      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          sms_sent: true,
          pipeline_stage: "SMS_SENT",
        },
      });

      results.push({ leadId: lead.id, success: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[SMS] Failed to send to lead ${lead.id}:`, msg);
      results.push({ leadId: lead.id, success: false, error: msg });
    }
  }

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  res.json({
    sent: succeeded,
    failed,
    skipped: lead_ids.length - leads.length,
    results,
  });
});

export default router;
