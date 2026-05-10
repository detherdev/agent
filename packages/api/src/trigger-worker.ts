// Initialise Sentry before any other imports.
import "./sentry.js";

import { startTriggers } from "./triggers/index.js";

console.log("trigger-worker starting (schedule 60s, email 90s, drive 120s, reaper 150s, orchestrator 30s)");
startTriggers();

// Keep the process alive — setInterval timers do, but a tiny heartbeat
// every 5min makes the logs less mysterious.
setInterval(() => {
  console.log(`trigger-worker heartbeat ${new Date().toISOString()}`);
}, 5 * 60_000);
