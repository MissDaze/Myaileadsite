import "dotenv/config";
import { Worker, Job } from "bullmq";
import { PrismaClient } from "@prisma/client";
import { BuildJobData } from "../lib/queue";
import { generateWebsite } from "../services/openrouter";
import { createRepoAndPush } from "../services/github";
import { deployToRailway } from "../services/railway";
import { sendSms, buildFollowUpMessage } from "../services/textmagic";

const prisma = new PrismaClient();

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

function parseRedisUrl(url: string): { host: string; port: number; password?: string } {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: parseInt(u.port || "6379", 10),
    password: u.password || undefined,
  };
}

const connectionOptions = parseRedisUrl(REDIS_URL);

async function appendLog(leadId: string, message: string): Promise<void> {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;

  // Use raw SQL to append to build_log without overwriting
  await prisma.$executeRaw`
    UPDATE "Lead"
    SET build_log = COALESCE(build_log, '') || ${line},
        updated_at = NOW()
    WHERE id = ${leadId}
  `;
}

async function processJob(job: Job<BuildJobData>): Promise<void> {
  const { leadId } = job.data;

  console.log(`[BuildWorker] Starting build for lead: ${leadId}`);

  // Fetch lead
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new Error(`Lead ${leadId} not found`);

  // Mark as building
  await prisma.lead.update({
    where: { id: leadId },
    data: { build_status: "BUILDING", pipeline_stage: "BUILDING", build_log: "" },
  });
  await appendLog(leadId, `Build started for ${lead.business_name}`);

  // Step 1: Generate website via OpenRouter
  await appendLog(leadId, "Calling OpenRouter to generate website files...");
  const generated = await generateWebsite(lead);
  await appendLog(leadId, `OpenRouter returned ${generated.files.length} files. Slug: ${generated.slug}`);

  // Step 2: Push to GitHub
  await appendLog(leadId, "Creating GitHub repository and pushing files...");
  const githubRepoUrl = await createRepoAndPush(
    generated.slug,
    lead.business_name,
    generated.files
  );
  await appendLog(leadId, `GitHub repo created: ${githubRepoUrl}`);

  // Save github_repo_url immediately
  await prisma.lead.update({
    where: { id: leadId },
    data: { github_repo_url: githubRepoUrl },
  });

  // Step 3: Deploy to Railway
  await appendLog(leadId, "Deploying to Railway...");
  const deployResult = await deployToRailway(
    generated.slug,
    githubRepoUrl,
    generated.envVars
  );
  await appendLog(leadId, `Railway deployment live at: ${deployResult.siteUrl}`);

  // Step 4: Mark complete
  await prisma.lead.update({
    where: { id: leadId },
    data: {
      build_status: "COMPLETE",
      site_url: deployResult.siteUrl,
      github_repo_url: githubRepoUrl,
      pipeline_stage: "DEPLOYED",
    },
  });
  await appendLog(leadId, "Build complete. Site deployed successfully.");

  // Step 5: Send follow-up SMS
  await appendLog(leadId, "Sending follow-up SMS...");
  try {
    const followUpMessage = buildFollowUpMessage(lead.business_name, deployResult.siteUrl);
    await sendSms(lead.phone, followUpMessage);
    await prisma.lead.update({
      where: { id: leadId },
      data: {
        followup_sms_sent: true,
        pipeline_stage: "FOLLOWUP_SENT",
      },
    });
    await appendLog(leadId, "Follow-up SMS sent successfully.");
  } catch (smsErr) {
    const msg = smsErr instanceof Error ? smsErr.message : String(smsErr);
    await appendLog(leadId, `Warning: Follow-up SMS failed: ${msg}`);
    // Don't throw – build is still complete
  }

  console.log(`[BuildWorker] Build complete for lead: ${leadId}`);
}

const worker = new Worker<BuildJobData>(
  "build",
  async (job) => {
    await processJob(job);
  },
  {
    connection: connectionOptions,
    concurrency: 2,
  }
);

worker.on("completed", (job) => {
  console.log(`[BuildWorker] Job ${job.id} completed`);
});

worker.on("failed", async (job, err) => {
  console.error(`[BuildWorker] Job ${job?.id} failed:`, err.message);
  if (job?.data.leadId) {
    try {
      const timestamp = new Date().toISOString();
      const errorLine = `[${timestamp}] BUILD FAILED: ${err.message}\n`;
      await prisma.lead.update({
        where: { id: job.data.leadId },
        data: { build_status: "FAILED" },
      });
      await prisma.$executeRaw`
        UPDATE "Lead"
        SET build_log = COALESCE(build_log, '') || ${errorLine},
            updated_at = NOW()
        WHERE id = ${job.data.leadId}
      `;
    } catch (updateErr) {
      console.error("[BuildWorker] Failed to update lead status:", updateErr);
    }
  }
});

worker.on("error", (err) => {
  console.error("[BuildWorker] Worker error:", err);
});

console.log("[BuildWorker] Worker started, listening for build jobs...");

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("[BuildWorker] Shutting down...");
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("[BuildWorker] Shutting down...");
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
});
