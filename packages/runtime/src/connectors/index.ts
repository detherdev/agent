import type { ToolDefinition } from "../types.js";
import { gmailTools } from "./gmail.js";
import { quickBooksTools } from "./quickbooks.js";

export {
  nangoProxy,
  getConnection,
  fetchNangoConnection,
  extractProviderMetadata,
} from "./nango.js";

const REGISTRY: Record<string, () => ToolDefinition[]> = {
  gmail: gmailTools,
  quickbooks: quickBooksTools,
};

export function listConnectorSlugs(): string[] {
  return Object.keys(REGISTRY);
}

export function loadConnectorTools(slug: string): ToolDefinition[] {
  const factory = REGISTRY[slug];
  if (!factory) return [];
  return factory();
}
