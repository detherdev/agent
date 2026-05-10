// The pre-auth header-trusting middleware was here. JWT verification +
// workspace resolution now lives in ./auth.ts. This file is intentionally
// minimal and re-exported for compatibility with any older imports.

export { verifyClerkJwt, requireWorkspace, requireMatchingWorkspace } from "./auth.js";
