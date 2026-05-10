import { startTriggers } from "./triggers/index.js";

console.log("trigger-worker starting (schedule every 60s, email poll every 90s)");
startTriggers();

// Keep the process alive — setInterval timers do, but a tiny health
// liveness print every 5min makes the logs less mysterious.
setInterval(() => {
  console.log(`trigger-worker tick ${new Date().toISOString()}`);
}, 5 * 60_000);
