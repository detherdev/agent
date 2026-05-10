import { log } from "runtime";
import { scheduleTick } from "./schedule.js";
import { emailTick } from "./email.js";

/**
 * Run the trigger loops forever. Two timers, intentionally not aligned:
 *   schedule  every 60s  (cron resolution = 1 minute)
 *   email     every 90s  (Gmail API rate limits + reasonable freshness)
 *
 * Each tick is wrapped in try/catch so a transient error in one workflow
 * never stops the loop.
 */
export function startTriggers(): void {
  schedule(60_000, "schedule", scheduleTick);
  schedule(90_000, "email", emailTick);
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
