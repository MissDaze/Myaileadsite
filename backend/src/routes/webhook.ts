import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { normalisePhone, phonesMatch } from "../lib/phone";
import { classifyIntent } from "../services/claude";
import { enqueueBuildJob } from "../lib/queue";

const router = Router();
const prisma = new PrismaClient();

// Keywords for rule-based classification
const POSITIVE_KEYWORDS = [
  "yes",
  "interested",
  "how much",
  "tell me more",
  "sure",
  "absolutely",
  "sounds good",
  "i'm in",
  "im in",
  "ok",
  "okay",
  "yep",
  "yup",
  "definitely",
  "of course",
  "please",
  "go ahead",
  "love to",
  "would like",
  "great",
];

const NEGATIVE_KEYWORDS = [
  "stop",
  "no",
  "no thanks",
  "not interested",
  "unsubscribe",
  "opt out",
  "remove me",
  "do not contact",
  "don't contact",
  "cancel",
  "nope",
  "nah",
  "go away",
  "leave me alone",
  "never",
];

type Intent = "POSITIVE" | "NEGATIVE" | "NEUTRAL";

function classifyKeywords(text: string): Intent | null {
  const lower = text.toLowerCase().trim();

  for (const kw of NEGATIVE_KEYWORDS) {
    if (lower.includes(kw)) return "NEGATIVE";
  }
  for (const kw of POSITIVE_KEYWORDS) {
    if (lower.includes(kw)) return "POSITIVE";
  }
  return null;
}

// POST /api/webhook/textmagic
// ALWAYS returns 200 even on errors
router.post("/textmagic", async (req: Request, res: Response): Promise<void> => {
  // Acknowledge immediately
  res.status(200).json({ ok: true });

  try {
    const body = req.body as Record<string, unknown>;

    // TextMagic webhook payload contains: messageId, text, receiver, sender, etc.
    const replyText =
      typeof body["text"] === "string"
        ? body["text"]
        : typeof body["message"] === "string"
        ? body["message"]
        : "";

    const senderPhone =
      typeof body["sender"] === "string"
        ? body["sender"]
        : typeof body["from"] === "string"
        ? body["from"]
        : "";

    if (!senderPhone) {
      console.warn("[Webhook] Received TextMagic webhook with no sender phone");
      return;
    }

    if (!replyText) {
      console.warn("[Webhook] Received TextMagic webhook with no text from", senderPhone);
      return;
    }

    console.log(`[Webhook] Reply from ${senderPhone}: "${replyText}"`);

    // Find lead by normalised phone
    const normalisedIncoming = normalisePhone(senderPhone);
    const leads = await prisma.lead.findMany({
      where: { sms_sent: true },
    });

    const matchedLead = leads.find((l) => phonesMatch(l.phone, normalisedIncoming));

    if (!matchedLead) {
      console.warn(`[Webhook] No lead found matching phone: ${senderPhone} (normalised: ${normalisedIncoming})`);
      return;
    }

    // Classify intent
    let intent: Intent = classifyKeywords(replyText) ?? "NEUTRAL";

    // Use Claude for ambiguous cases
    if (intent === "NEUTRAL") {
      try {
        intent = await classifyIntent(replyText);
      } catch (claudeErr) {
        console.error("[Webhook] Claude classification failed:", claudeErr);
        // Keep NEUTRAL
      }
    }

    // Determine pipeline stage
    const pipelineStage =
      intent === "POSITIVE"
        ? "REPLIED_POSITIVE"
        : intent === "NEGATIVE"
        ? "CLOSED_LOST"
        : matchedLead.pipeline_stage;

    // Update lead
    await prisma.lead.update({
      where: { id: matchedLead.id },
      data: {
        reply_text: replyText,
        intent,
        pipeline_stage: pipelineStage,
      },
    });

    console.log(`[Webhook] Lead ${matchedLead.id} (${matchedLead.business_name}) classified as ${intent}`);

    // Queue build job for positive replies
    if (intent === "POSITIVE") {
      try {
        await prisma.lead.update({
          where: { id: matchedLead.id },
          data: { build_status: "QUEUED" },
        });
        await enqueueBuildJob(matchedLead.id);
        console.log(`[Webhook] Build job queued for lead ${matchedLead.id}`);
      } catch (queueErr) {
        console.error("[Webhook] Failed to queue build job:", queueErr);
      }
    }
  } catch (err) {
    console.error("[Webhook] Unhandled error processing TextMagic webhook:", err);
    // Response already sent – do not re-send
  }
});

export default router;
