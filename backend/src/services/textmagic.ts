import axios from "axios";
import { normalisePhone } from "../lib/phone";

interface TextMagicSendResponse {
  id: number;
  href: string;
  type: string;
  sessionId: number;
  bulkId: number | null;
  messageId: number;
  scheduleId: number;
}

function getHeaders(): Record<string, string> {
  const username = process.env.TEXTMAGIC_USERNAME;
  const apiKey = process.env.TEXTMAGIC_API_KEY;
  if (!username || !apiKey) {
    throw new Error("TEXTMAGIC_USERNAME or TEXTMAGIC_API_KEY not configured");
  }
  return {
    "X-TM-Username": username,
    "X-TM-Key": apiKey,
    "Content-Type": "application/json",
  };
}

export async function sendSms(
  phone: string,
  text: string
): Promise<TextMagicSendResponse> {
  const normalised = normalisePhone(phone);
  const headers = getHeaders();

  const response = await axios.post<TextMagicSendResponse>(
    "https://rest.textmagic.com/api/v2/messages",
    {
      phones: normalised,
      text,
    },
    { headers, timeout: 30_000 }
  );

  return response.data;
}

export async function sendBulkSms(
  recipients: Array<{ phone: string; businessName: string }>
): Promise<void> {
  // TextMagic supports sending to multiple phones in one request
  // but we personalise messages per lead so we send individually
  const errors: string[] = [];

  for (const recipient of recipients) {
    const message = buildLeadSmsMessage(recipient.businessName);
    try {
      await sendSms(recipient.phone, message);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Failed to send to ${recipient.phone}: ${msg}`);
    }
  }

  if (errors.length > 0) {
    console.error("[TextMagic] Bulk send errors:", errors);
  }
}

export function buildLeadSmsMessage(businessName: string): string {
  return (
    `Hi ${businessName}, we noticed you don't have a website yet. ` +
    `We build professional sites for local businesses like yours. ` +
    `Interested? Reply YES. Reply STOP to opt out.`
  );
}

export function buildFollowUpMessage(businessName: string, siteUrl: string): string {
  return (
    `Hi ${businessName}, great news! Your new website is ready: ${siteUrl} ` +
    `Take a look and let us know what you think! Reply STOP to opt out.`
  );
}
