import axios from "axios";
import { createDecipheriv, createHash } from "crypto";
import { PrismaClient } from "@prisma/client";
import { normalisePhone } from "../lib/phone";

const prisma = new PrismaClient();

interface TextMagicSendResponse {
  id: number;
  href: string;
  type: string;
  sessionId: number;
  bulkId: number | null;
  messageId: number;
  scheduleId: number;
}

function decrypt(value: string): string {
  const secret = process.env.OAUTH_TOKEN_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret) throw new Error("Credential encryption key is not configured");
  const [iv, tag, body] = value.split(".");
  if (!iv || !tag || !body) throw new Error("Invalid encrypted credential");
  const key = createHash("sha256").update(secret).digest();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}

async function getHeaders(workspaceId?: string): Promise<Record<string, string>> {
  let username = process.env.TEXTMAGIC_USERNAME;
  let apiKey = process.env.TEXTMAGIC_API_KEY;

  const connection = await prisma.oAuthConnection.findFirst({
    where: {
      provider: "textmagic",
      status: "CONNECTED",
      ...(workspaceId ? { workspace_id: workspaceId } : {}),
    },
    orderBy: { updated_at: "desc" },
  });
  if (connection?.encrypted_access_token && connection.encrypted_refresh_token) {
    username = decrypt(connection.encrypted_access_token);
    apiKey = decrypt(connection.encrypted_refresh_token);
  }

  if (!username || !apiKey) {
    throw new Error("Connect TextMagic in Import Contacts before sending SMS");
  }
  return {
    "X-TM-Username": username,
    "X-TM-Key": apiKey,
    "Content-Type": "application/json",
  };
}

export async function testTextMagicCredentials(username: string, apiKey: string): Promise<void> {
  await axios.get("https://rest.textmagic.com/api/v2/user", {
    headers: {
      "X-TM-Username": username,
      "X-TM-Key": apiKey,
      "Content-Type": "application/json",
    },
    timeout: 15_000,
  });
}

export async function sendSms(
  phone: string,
  text: string,
  workspaceId?: string
): Promise<TextMagicSendResponse> {
  const normalised = normalisePhone(phone);
  const headers = await getHeaders(workspaceId);

  const response = await axios.post<TextMagicSendResponse>(
    "https://rest.textmagic.com/api/v2/messages",
    { phones: normalised, text },
    { headers, timeout: 30_000 }
  );
  return response.data;
}

export async function sendBulkSms(
  recipients: Array<{ phone: string; businessName: string }>
): Promise<void> {
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
  if (errors.length > 0) console.error("[TextMagic] Bulk send errors:", errors);
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
