import Anthropic from "@anthropic-ai/sdk";

import {
  type EmailExtraction,
  type EmailExtractionInput,
  type LlmExtractor,
  emailExtractionSchema,
} from "@/lib/llm/types";

/**
 * Anthropic model id. Sonnet 4.6 is the cost/quality sweet spot for an
 * inbox the size of a single user: cheap enough to run on every polled
 * message without budget anxiety, and easily strong enough to pick out
 * named entities, dates, and a 7-way stage label from short emails.
 * Haiku underfit on relationship extraction in our spot-checks; Opus was
 * overkill for the volume.
 */
const MODEL_ID = "claude-sonnet-4-6";

/**
 * Tool name the model is forced to invoke. We use single-tool, forced-use
 * structured output (rather than asking for JSON in free text) because it's
 * the most reliable way to get a schema-conformant response back out of the
 * model — the SDK will surface the parsed args under a `tool_use` block.
 */
const TOOL_NAME = "record_extraction";

/**
 * Max tokens for the tool_use response. 2k is comfortably more than even a
 * verbose extraction needs (~25 entities + summary), and well under the
 * model's output window. Bump if we start truncating.
 */
const MAX_OUTPUT_TOKENS = 2048;

/**
 * The system prompt and the tool input schema are stable across every call
 * — exactly the shape prompt caching is for. We mark them `ephemeral` (5
 * minute TTL), which is more than enough because the cron polls in tight
 * bursts. Across long quiet stretches the cache will evict and we'll just
 * pay the priming cost again; that's fine.
 *
 * IMPORTANT: keep the system text and tool schema BYTE-stable. Any change
 * busts the cache. Use comments here in source, not in the prompt body.
 */
const SYSTEM_PROMPT = `You are an information-extraction assistant for a job-search CRM.

You receive one email at a time — usually from a recruiter, hiring manager, or job platform — and must return a structured summary that downstream automation can use to update an application pipeline.

Extraction goals, in priority order:
1. PEOPLE: every named individual mentioned (sender, recipient, recruiter, hiring manager, interviewer, referral). Include their email if you can read it off the message. Include their role and the company they work at if either is mentioned.
2. COMPANIES: every employer or platform named. Distinguish employer (the company hiring) from platforms (LinkedIn, Greenhouse, etc.). Include the company's web domain only if you see it verbatim in the email.
3. DATES: any time-pinned event — interview slots, deadlines, follow-up dates. Convert relative phrases ("next Tuesday at 3pm") to ISO 8601 using the email's sentAt as the anchor. Include a short context snippet (~10 words around the date in the original text).
4. STAGE SIGNAL: if the email implies the application moved between pipeline stages — applied, screen scheduled, interview scheduled, offer extended, rejected, accepted — emit a stageSignal with one of {lead, applied, screen, interview, offer, closed_won, closed_lost} and a confidence in [0,1]. Reject/decline => closed_lost. Offer accepted => closed_won. If unsure, OMIT the signal rather than guessing.
5. RELATIONSHIPS: contact->company links you can confidently infer from the email content. Use one of {works_at, recruited_for, introduced_by, colleague_of}. ALWAYS include a verbatim sourceQuote — the snippet of the email that supports the inference. Confidence in [0,1].
6. SUMMARY: one sentence (<25 words) describing what this email means for the job search.

Rules:
- NEVER invent names, emails, dates, or quotes. If the email doesn't say it, leave the field out.
- If only metadata (sender + subject) is available, still extract what you can — the sender's address often tells you their company; the subject often signals stage.
- Confidence calibration: 0.9+ means "the email states this plainly"; 0.5–0.8 means "strong inference from one signal"; below 0.5, omit the candidate entirely.
- Return ALL findings in a single call to the record_extraction tool. Do not write commentary outside the tool call.`;

/**
 * Input schema for the `record_extraction` tool. This is sent to the model
 * verbatim, so the field descriptions matter — they're the model's only
 * spec. Mirrors `emailExtractionSchema` in `src/lib/llm/types.ts`; if you
 * change one, change the other.
 */
const TOOL_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    people: {
      type: "array",
      description: "Every named individual mentioned in the email.",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          email: { type: "string" },
          role: { type: "string" },
          company: { type: "string" },
        },
        required: ["name"],
        additionalProperties: false,
      },
    },
    companies: {
      type: "array",
      description: "Every employer or platform named in the email.",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          domain: {
            type: "string",
            description: "Only if the domain appears verbatim in the email.",
          },
        },
        required: ["name"],
        additionalProperties: false,
      },
    },
    dates: {
      type: "array",
      description: "Time-pinned events: interviews, deadlines, follow-ups.",
      items: {
        type: "object",
        properties: {
          iso: {
            type: "string",
            description:
              "ISO 8601 timestamp. Resolve relative phrases against the email sentAt.",
          },
          context: {
            type: "string",
            description: "~10 words around the date in the original text.",
          },
        },
        required: ["iso", "context"],
        additionalProperties: false,
      },
    },
    stageSignal: {
      type: "object",
      description:
        "Emit only if the email implies a stage transition. Omit if unsure.",
      properties: {
        toStage: {
          type: "string",
          enum: [
            "lead",
            "applied",
            "screen",
            "interview",
            "offer",
            "closed_won",
            "closed_lost",
          ],
        },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        reason: { type: "string" },
      },
      required: ["toStage", "confidence", "reason"],
      additionalProperties: false,
    },
    relationships: {
      type: "array",
      description:
        "Contact->company links inferred from the email. ALWAYS include a verbatim sourceQuote.",
      items: {
        type: "object",
        properties: {
          contact: {
            type: "object",
            properties: {
              name: { type: "string" },
              email: { type: "string" },
            },
            required: ["name"],
            additionalProperties: false,
          },
          company: {
            type: "object",
            properties: {
              name: { type: "string" },
            },
            required: ["name"],
            additionalProperties: false,
          },
          role: { type: "string" },
          relation: {
            type: "string",
            enum: ["works_at", "recruited_for", "introduced_by", "colleague_of"],
          },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          sourceQuote: { type: "string" },
        },
        required: ["contact", "relation", "confidence", "sourceQuote"],
        additionalProperties: false,
      },
    },
    summary: {
      type: "string",
      description:
        "One sentence (<25 words) describing what this email means for the job search.",
    },
  },
  required: ["people", "companies", "dates", "relationships", "summary"],
  additionalProperties: false,
};

/**
 * Build the user message — the per-email payload that's NOT cached.
 * Kept short and structured so the model never confuses metadata with body.
 */
function buildUserMessage(input: EmailExtractionInput): string {
  const lines = [
    `sender: ${input.sender}`,
    `subject: ${input.subject ?? "(none)"}`,
    `sentAt: ${input.sentAt.toISOString()}`,
    "---",
  ];
  if (input.bodyText && input.bodyText.trim().length > 0) {
    lines.push(input.bodyText);
  } else {
    lines.push(
      "(body not available — only metadata above; extract from sender and subject)",
    );
  }
  return lines.join("\n");
}

/**
 * Lazy SDK client cache. We do NOT construct at module load: the cron route
 * imports this module at build time (Next.js evaluates routes during
 * page-data collection), and we don't want missing `ANTHROPIC_API_KEY` to
 * break `next build`. The key is read on first use, not on import.
 */
let cachedClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Set it in .env.local (or the Vercel project) before running extraction.",
    );
  }
  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

/**
 * Concrete {@link LlmExtractor} backed by Anthropic's Claude.
 *
 * Reset hook: tests that want a fresh module can use `vi.resetModules()`.
 * We deliberately don't expose a public reset function in production code.
 */
export function createClaudeLlmExtractor(): LlmExtractor {
  return {
    name: MODEL_ID,
    async extractFromEmail(
      input: EmailExtractionInput,
    ): Promise<EmailExtraction> {
      const client = getClient();

      const response = await client.messages.create({
        model: MODEL_ID,
        max_tokens: MAX_OUTPUT_TOKENS,
        // System prompt is cached; the tool definition is also cached (the
        // tool array sits before the per-email content in the cache window).
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        tools: [
          {
            name: TOOL_NAME,
            description:
              "Record the structured extraction for one email. Always call this exactly once.",
            input_schema: TOOL_INPUT_SCHEMA,
            cache_control: { type: "ephemeral" },
          },
        ],
        // Force the model to invoke our tool — no free-text fallback.
        tool_choice: { type: "tool", name: TOOL_NAME },
        messages: [
          {
            role: "user",
            content: buildUserMessage(input),
          },
        ],
      });

      const toolUseBlock = response.content.find(
        (block) => block.type === "tool_use" && block.name === TOOL_NAME,
      );
      if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
        throw new Error(
          `Claude response missing expected tool_use block for '${TOOL_NAME}'. ` +
            `stop_reason=${response.stop_reason} content_blocks=${response.content
              .map((b) => b.type)
              .join(",")}`,
        );
      }

      const parsed = emailExtractionSchema.safeParse(toolUseBlock.input);
      if (!parsed.success) {
        throw new Error(
          `Claude returned a tool_use payload that failed schema validation. ` +
            `Issues: ${JSON.stringify(parsed.error.issues)} ` +
            `Raw input keys: ${
              typeof toolUseBlock.input === "object" && toolUseBlock.input !== null
                ? Object.keys(toolUseBlock.input).join(",")
                : typeof toolUseBlock.input
            }`,
        );
      }

      return parsed.data;
    },
  };
}
