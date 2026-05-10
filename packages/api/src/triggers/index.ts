import { log } from "runtime";
import { scheduleTick } from "./schedule.js";
import { emailTick } from "./email.js";
import { driveTick } from "./drive.js";
import { reaperTick } from "./reaper.js";
import { orchestratorTick } from "../services/orchestrator.js";

/**
 * Run the trigger loops forever. Five timers, intentionally not aligned so
 * one slow tick doesn't pile onto another:
 *   schedule      every 60s   (cron resolution = 1 minute)
 *   email         every 90s   (Gmail API rate limits + reasonable freshness)
 *   drive         every 120s  (Drive folder watch — same model as email)
 *   reaper        every 150s  (recover runs stranded by worker crashes)
 *   orchestrator  every 30s   (task phase advancement — the lowest latency
 *                              of the bunch because human-gate approvals
 *                              should feel snappy)
 *
 * Each tick is wrapped in try/catch so a transient error in one workflow
 * never stops the loop.
 */
export function startTriggers(): void {
  schedule(60_000, "schedule", scheduleTick);
  schedule(90_000, "email", emailTick);
  schedule(120_000, "drive", driveTick);
  schedule(150_000, "reaper", reaperTick);
  schedule(30_000, "orchestrator", orchestratorTick);
}

function schedule(intervalMs: number, label: string, fn: () => Promise<void>): void {
  const tick = async () => {
    try {
      await fn();
    } catch (err) {
      log.error({ tick: label, err: (err as Error).message }, "trigger tick failed");
    }
  };
  // Run once at startup so a fresh dev environment doesn't wait the full
  // interval before the first poll, then schedule the recurring tick.
  void tick();
  setInterval(tick, intervalMs);
}
