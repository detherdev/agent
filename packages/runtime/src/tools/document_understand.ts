import Anthropic from "@anthropic-ai/sdk";
import type { ContentBlockParam, ImageBlockParam, DocumentBlockParam } from "@anthropic-ai/sdk/resources/messages";
import { query } from "../db.js";
import type { ToolDefinition } from "../types.js";

const client = new Anthropic();

const DOC_MODEL = process.env.DOCUMENT_UNDERSTAND_MODEL ?? "claude-sonnet-4-6";

export interface RunAttachment {
  name: string;
  content_type: string;
  content_base64: string;
  size_bytes?: number;
}

interface RunInputWithAttachments {
  attachments?: RunAttachment[];
  [key: string]: unknown;
}

const SYSTEM = `You are an extraction sub-agent. You receive a single document
(PDF or image) and a natural-language schema description. Extract the requested
data and return ONLY a JSON object matching the schema. No prose, no commentary,
no code fences. If a field can't be found in the document, set it to null and
add it to a "missing_fields" array. If the document doesn't appear to be the
type the schema describes, return {"error": "wrong_document_type", "what_it_appears_to_be": "..."}.`;

/**
 * Vision-backed document understanding. Reads one of the run's input
 * attachments (provided by an inbound_email or drive_watch trigger) and
 * returns structured data per the requested schema.
 *
 * Supports PDF and common image types natively via Claude's vision API.
 * No OCR layer needed.
 */
export function documentUnderstandTool(): ToolDefinition {
  return {
    name: "document_understand",
    description:
      "Extract structured data from one of the trigger's attached documents (PDF, PNG, JPG). " +
      "Provide attachment_index (0-based) and a plain-language schema_description telling me " +
      "what fields to pull. Returns a JSON object — no prose. Use for invoices, receipts, " +
      "contracts, forms, screenshots, scanned anything.",
    input_schema: {
      type: "object",
      properties: {
        attachment_index: {
          type: "integer",
          minimum: 0,
          description: "Which attachment to read (index into the trigger input's attachments[])",
        },
        schema_description: {
          type: "string",
          description:
            "Plain-language description of the fields to extract, e.g. 'vendor name (string), " +
            "invoice number (string), invoice date (ISO), line items (array of {description, qty, unit_price, total}), grand_total (number), currency (ISO 4217)'.",
        },
      },
      required: ["attachment_index", "schema_description"],
    },
    invoke: async (input, ctx) => {
      const { attachment_index, schema_description } = input as {
        attachment_index: number;
        schema_description: string;
      };

      const r = await query<{ input: RunInputWithAttachments }>(
        `select input from runs where id = $1`,
        [ctx.run_id],
      );
      const runInput = r.rows[0]?.input;
      const attachments = runInput?.attachments ?? [];
      const att = attachments[attachment_index];
      if (!att) {
        return {
          content: `No attachment at index ${attachment_index}; trigger has ${attachments.length} attachment(s).`,
          is_error: true,
        };
      }

      const block = makeContentBlock(att);
      if (!block) {
        return {
          content: `Unsupported attachment type: ${att.content_type}. Supported: application/pdf, image/png, image/jpeg, image/gif, image/webp.`,
          is_error: true,
        };
      }

      try {
        const res = await client.messages.create({
          model: DOC_MODEL,
          max_tokens: 2048,
          system: SYSTEM,
          messages: [
            {
              role: "user",
              content: [
                block,
                {
                  type: "text",
                  text: `SCHEMA:\n${schema_description}\n\nReturn JSON only.`,
                } as ContentBlockParam,
              ],
            },
          ],
        });

        const text = res.content
          .filter((b) => b.type === "text")
          .map((b) => (b as { text: string }).text)
          .join("");

        // Strip code fences if Claude added them despite the instruction.
        const cleaned = text.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "");

        return {
          content: `extracted from "${att.name}":\n${cleaned}`,
          meta: {
            input_tokens: res.usage.input_tokens,
            output_tokens: res.usage.output_tokens,
          },
        };
      } catch (err) {
        return {
          content: `document_understand failed: ${(err as Error).message}`,
          is_error: true,
        };
      }
    },
  };
}

function makeContentBlock(att: RunAttachment): ImageBlockParam | DocumentBlockParam | null {
  const mt = att.content_type.toLowerCase();
  if (mt === "application/pdf") {
    return {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: att.content_base64 },
    };
  }
  if (mt === "image/png" || mt === "image/jpeg" || mt === "image/gif" || mt === "image/webp") {
    return {
      type: "image",
      source: { type: "base64", media_type: mt, data: att.content_base64 },
    };
  }
  return null;
}
