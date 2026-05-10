import pino from "pino";

export const log = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "runtime" },
});

export function runLog(runId: string) {
  return log.child({ run_id: runId });
}
