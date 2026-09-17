import { Router, Request, Response } from "express";
import { createCipheriv, createDecipheriv, createHash, randomBytes, createHmac } from "crypto";
import { PrismaClient } from "@prisma/client";
import { requireAuth } from "../middleware/auth";
import { sendSms, testTextMagicCredentials } from "../services/textmagic";

const router = Router();
const prisma = new PrismaClient();

type ImportRow = Record<string, unknown>;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function workspaceId(): Promise<string> {
  const username = process.env.ADMIN_USERNAME || "admin";
  const user = await prisma.appUser.upsert({
    where: { username },
    update: {},
    create: { username, display_name: username },
  });
  const existing = await prisma.workspaceUser.findFirst({ where: { user_id: user.id } });
  if (existing) return existing.workspace_id;
  const workspace = await prisma.workspace.create({
    data: {
      name: "LeadForge Workspace",
      users: { create: { user_id: user.id, role: "OWNER" } },
    },
  });
  return workspace.id;
}

function text(row: ImportRow, keys: string[]): string | null {
  const entries = Object.entries(row);
  for (const key of keys) {
    const match = entries.find(([name]) => name.toLowerCase().replace(/[^a-z0-9]/g, "") === key);
    if (match && String(match[1] ?? "").trim()) return String(match[1]).trim();
  }
  return null;
}

function encryptionKey(): Buffer {
  const secret = process.env.OAUTH_TOKEN_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret) throw new Error("OAuth token encryption key is not configured");
  return createHash("sha256").update(secret).digest();
}

function encrypt(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

function decrypt(value: string): string {
  const [iv, tag, body] = value.split(".");
  if (!iv || !tag || !body) throw new Error("Invalid encrypted token");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}

router.get("/status", requireAuth, async (_req, res) => {
  const id = await workspaceId();
  const connections = await prisma.oAuthConnection.findMany({
    where: { workspace_id: id },
    select: { provider: true, provider_email: true, status: true, updated_at: true },
  });
  res.json({
    google_oauth_available: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.OAUTH_CALLBACK_BASE_URL),
    microsoft_oauth_available: Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET),
    sms_available: Boolean(
      (process.env.TEXTMAGIC_USERNAME && process.env.TEXTMAGIC_API_KEY) ||
      connections.some((connection) => connection.provider === "textmagic" && connection.status === "CONNECTED")
    ),
    connections,
  });
});

router.post("/providers/textmagic", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const id = await workspaceId();
  const username = String(req.body?.username || "").trim();
  const apiKey = String(req.body?.api_key || "").trim();
  if (!username || !apiKey) {
    res.status(400).json({ error: "TextMagic username and API key are required" });
    return;
  }
  try {
    await testTextMagicCredentials(username, apiKey);
    await prisma.oAuthConnection.upsert({
      where: { workspace_id_provider: { workspace_id: id, provider: "textmagic" } },
      update: {
        provider_account_id: username,
        provider_email: username,
        encrypted_access_token: encrypt(username),
        encrypted_refresh_token: encrypt(apiKey),
        status: "CONNECTED",
      },
      create: {
        workspace_id: id,
        provider: "textmagic",
        provider_account_id: username,
        provider_email: username,
        encrypted_access_token: encrypt(username),
        encrypted_refresh_token: encrypt(apiKey),
        status: "CONNECTED",
      },
    });
    res.json({ connected: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "TextMagic connection failed";
    res.status(400).json({ error: message });
  }
});

router.get("/contacts", requireAuth, async (_req, res) => {
  const id = await workspaceId();
  const contacts = await prisma.contact.findMany({ where: { workspace_id: id }, orderBy: { created_at: "desc" } });
  res.json({ contacts });
});

router.post("/contacts/import", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const id = await workspaceId();
  const rows = Array.isArray(req.body?.rows) ? req.body.rows as ImportRow[] : [];
  const filename = String(req.body?.filename || "Imported contacts");
  const sourceType = String(req.body?.source_type || "FILE");
  if (!rows.length) {
    res.status(400).json({ error: "No contact rows supplied" });
    return;
  }

  let imported = 0, duplicates = 0, rejected = 0;
  for (const row of rows.slice(0, 10000)) {
    const company = text(row, ["company", "companyname", "business", "businessname", "organisation", "organization"]);
    const email = text(row, ["email", "emailaddress", "workemail"]);
    const phone = text(row, ["phone", "phonenumber", "mobile", "telephone"]);
    if (!company || (!email && !phone)) { rejected++; continue; }

    const duplicate = await prisma.contact.findFirst({
      where: {
        workspace_id: id,
        OR: [
          ...(email ? [{ email: email.toLowerCase() }] : []),
          ...(phone ? [{ phone }] : []),
        ],
      },
    });
    if (duplicate) { duplicates++; continue; }

    await prisma.contact.create({
      data: {
        workspace_id: id,
        company,
        first_name: text(row, ["firstname", "givenname", "contactfirstname"]),
        last_name: text(row, ["lastname", "surname", "familyname", "contactlastname"]),
        job_title: text(row, ["jobtitle", "title", "role", "position"]),
        email: email?.toLowerCase() ?? null,
        phone,
        website: text(row, ["website", "url", "companywebsite"]),
        source: filename,
        email_valid: Boolean(email && emailPattern.test(email)),
        phone_valid: Boolean(phone && phone.replace(/\D/g, "").length >= 8),
      },
    });
    imported++;
  }

  await prisma.contactImport.create({
    data: {
      workspace_id: id,
      filename,
      source_type: sourceType,
      total_rows: rows.length,
      imported_rows: imported,
      duplicate_rows: duplicates,
      rejected_rows: rejected,
    },
  });
  res.json({ total: rows.length, imported, duplicates, rejected });
});

router.get("/campaigns", requireAuth, async (_req, res) => {
  const id = await workspaceId();
  const campaigns = await prisma.campaign.findMany({
    where: { workspace_id: id },
    include: { _count: { select: { contacts: true } } },
    orderBy: { created_at: "desc" },
  });
  res.json({ campaigns });
});

router.post("/campaigns", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const id = await workspaceId();
  const { name, channel, sequence, brief, tone, contact_ids } = req.body ?? {};
  const channels = ["EMAIL_ONLY", "SMS_ONLY", "BOTH"];
  const sequences = ["EMAIL_THEN_SMS", "SMS_THEN_EMAIL", "SIMULTANEOUS", "EMAIL_FALLBACK_SMS"];
  if (!name || !brief || !channels.includes(channel) || !sequences.includes(sequence) || !Array.isArray(contact_ids)) {
    res.status(400).json({ error: "Invalid campaign details" });
    return;
  }
  const contacts = await prisma.contact.findMany({ where: { workspace_id: id, id: { in: contact_ids } } });
  const campaign = await prisma.campaign.create({
    data: {
      workspace_id: id,
      name,
      channel,
      sequence,
      brief,
      tone: tone || "PROFESSIONAL",
      contacts: {
        create: contacts.map((contact) => ({
          contact_id: contact.id,
          email_status: channel === "SMS_ONLY" ? "NOT_SELECTED" : "DRAFT",
          sms_status: channel === "EMAIL_ONLY" ? "NOT_SELECTED" : "DRAFT",
        })),
      },
    },
    include: { contacts: { include: { contact: true } } },
  });
  res.status(201).json({ campaign });
});

async function generateCopy(contact: { first_name: string | null; company: string; job_title: string | null }, brief: string, tone: string) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");
  const prompt = `Create personalised outreach for this contact. Contact: ${JSON.stringify(contact)}. Campaign brief: ${brief}. Tone: ${tone}. Return strict JSON with email_subject, email_body and sms_body. Email should be concise and professional. SMS must be under 320 characters. Never invent facts.`;
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || "deepseek/deepseek-chat",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 800,
    }),
  });
  if (!response.ok) throw new Error(`OpenRouter failed (${response.status})`);
  const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const raw = json.choices?.[0]?.message?.content || "{}";
  const parsed = JSON.parse(raw.replace(/^```json\s*|```$/g, "").trim());
  return {
    email_subject: String(parsed.email_subject || "A quick idea for your business"),
    email_body: String(parsed.email_body || ""),
    sms_body: String(parsed.sms_body || ""),
  };
}

router.post("/campaigns/:id/generate", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const id = await workspaceId();
  const campaign = await prisma.campaign.findFirst({
    where: { id: req.params.id as string, workspace_id: id },
    include: { contacts: { include: { contact: true } } },
  });
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }

  let generated = 0;
  for (const recipient of campaign.contacts) {
    const copy = await generateCopy(recipient.contact, campaign.brief, campaign.tone);
    await prisma.campaignContact.update({
      where: { id: recipient.id },
      data: {
        email_subject: copy.email_subject,
        email_body: copy.email_body,
        sms_body: copy.sms_body,
      },
    });
    generated++;
  }
  await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "REVIEW" } });
  res.json({ generated });
});

router.get("/campaigns/:id", requireAuth, async (req, res) => {
  const id = await workspaceId();
  const campaign = await prisma.campaign.findFirst({
    where: { id: req.params.id as string, workspace_id: id },
    include: { contacts: { include: { contact: true }, orderBy: { created_at: "asc" } } },
  });
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
  res.json({ campaign });
});

router.patch("/campaigns/:campaignId/messages/:messageId", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const id = await workspaceId();
  const campaign = await prisma.campaign.findFirst({ where: { id: req.params.campaignId as string, workspace_id: id } });
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
  const message = await prisma.campaignContact.update({
    where: { id: req.params.messageId as string },
    data: {
      email_subject: req.body.email_subject,
      email_body: req.body.email_body,
      sms_body: req.body.sms_body,
      approved: Boolean(req.body.approved),
    },
  });
  res.json({ message });
});

router.post("/campaigns/:id/approve-all", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const id = await workspaceId();
  const campaign = await prisma.campaign.findFirst({ where: { id: req.params.id as string, workspace_id: id } });
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
  await prisma.campaignContact.updateMany({ where: { campaign_id: campaign.id }, data: { approved: true } });
  await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "APPROVED", approved_at: new Date() } });
  res.json({ approved: true });
});

router.get("/oauth/google/start", requireAuth, async (_req: Request, res: Response): Promise<void> => {
  const id = await workspaceId();
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const base = process.env.OAUTH_CALLBACK_BASE_URL;
  const secret = process.env.JWT_SECRET;
  if (!clientId || !base || !secret) { res.status(503).json({ error: "Google OAuth is not configured" }); return; }
  const nonce = randomBytes(12).toString("hex");
  const payload = `${id}:${nonce}`;
  const state = Buffer.from(`${payload}:${createHmac("sha256", secret).update(payload).digest("hex")}`).toString("base64url");
  const redirect = `${base.replace(/\/$/, "")}/api/multichannel/oauth/google/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: "openid email https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/documents.readonly",
    state,
  });
  res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
});

router.get("/oauth/google/callback", async (req: Request, res: Response): Promise<void> => {
  const code = String(req.query.code || "");
  const state = String(req.query.state || "");
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const base = process.env.OAUTH_CALLBACK_BASE_URL;
  const frontend = process.env.FRONTEND_URL || process.env.RAILWAY_SERVICE_FRONTEND_URL;
  if (!code || !state || !clientId || !clientSecret || !base) { res.status(400).send("Invalid OAuth callback"); return; }
  const decoded = Buffer.from(state, "base64url").toString("utf8").split(":");
  const [workspace, nonce, signature] = decoded;
  const payload = `${workspace}:${nonce}`;
  const expected = createHmac("sha256", process.env.JWT_SECRET || "").update(payload).digest("hex");
  if (!workspace || signature !== expected) { res.status(400).send("Invalid OAuth state"); return; }
  const redirect = `${base.replace(/\/$/, "")}/api/multichannel/oauth/google/callback`;
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirect, grant_type: "authorization_code" }),
  });
  if (!tokenResponse.ok) { res.status(502).send("Google token exchange failed"); return; }
  const tokens = await tokenResponse.json() as { access_token: string; refresh_token?: string; expires_in?: number; scope?: string; id_token?: string };
  const profileResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
  const profile = await profileResponse.json() as { id?: string; email?: string };
  await prisma.oAuthConnection.upsert({
    where: { workspace_id_provider: { workspace_id: workspace, provider: "google" } },
    update: {
      provider_account_id: profile.id,
      provider_email: profile.email,
      encrypted_access_token: encrypt(tokens.access_token),
      encrypted_refresh_token: tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined,
      token_expires_at: new Date(Date.now() + (tokens.expires_in || 3600) * 1000),
      scopes: tokens.scope,
      status: "CONNECTED",
    },
    create: {
      workspace_id: workspace,
      provider: "google",
      provider_account_id: profile.id,
      provider_email: profile.email,
      encrypted_access_token: encrypt(tokens.access_token),
      encrypted_refresh_token: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
      token_expires_at: new Date(Date.now() + (tokens.expires_in || 3600) * 1000),
      scopes: tokens.scope,
      status: "CONNECTED",
    },
  });
  res.redirect(`${frontend || "/"}?oauth=google-connected`);
});

router.delete("/oauth/:provider", requireAuth, async (req, res) => {
  const id = await workspaceId();
  await prisma.oAuthConnection.deleteMany({ where: { workspace_id: id, provider: req.params.provider as string } });
  res.json({ disconnected: true });
});

export default router;
