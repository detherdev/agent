import { Queue } from "bullmq";
import { Redis } from "ioredis";

const url = process.env.REDIS_URL ?? "redis://localhost:6379";
export const connection = new Redis(url, { maxRetriesPerRequest: null });

export interface RunJob {
  runId: string;
  workflowId: string;
  resume?: boolean;
}

export const runsQueue = new Queue<RunJob>("runs", { connection });
