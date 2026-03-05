import { Queue } from "bullmq";
import dotenv from "dotenv";
dotenv.config();

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

export const buildQueue = new Queue("build", {
  connection: connectionOptions,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 200 },
  },
});

export interface BuildJobData {
  leadId: string;
}

export async function enqueueBuildJob(leadId: string): Promise<void> {
  await buildQueue.add(
    "build-site",
    { leadId } satisfies BuildJobData,
    { jobId: `build-${leadId}` }
  );
}
