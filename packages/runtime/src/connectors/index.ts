import type { ToolDefinition } from "../types.js";
import { gmailTools } from "./gmail.js";
import { quickBooksTools } from "./quickbooks.js";
import { outlookTools } from "./outlook.js";
import { stripeTools } from "./stripe.js";
import { slackTools } from "./slack.js";
import { driveTools } from "./drive.js";

export {
  nangoProxy,
  getConnection,
  fetchNangoConnection,
  extractProviderMetadata,
} from "./nango.js";

const REGISTRY: Record<string, () => ToolDefinition[]> = {
  gmail: gmailTools,
  quickbooks: quickBooksTools,
  outlook: outlookTools,
  stripe: stripeTools,
  slack: slackTools,
  "google-drive": driveTools,
};

export function listConnectorSlugs(): string[] {
  return Object.keys(REGISTRY);
}

export function loadConnectorTools(slug: string): ToolDefinition[] {
  const factory = REGISTRY[slug];
  if (!factory) return [];
  return factory();
}
