import Anthropic from "@anthropic-ai/sdk";

import {
  type EmailExtraction,
  type EmailExtractionInput,
  type FreeTextExtractionInput,
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
 * Shared head of every system prompt — the extraction rubric and confidence
 * calibration are identical across input modes. We pull them into one const
 * so prompt-caching stays effective: only the trailing input-mode-specific
 * paragraph differs between email and free-text calls, but each of those
 * trailing variants is itself byte-stable across calls of the same kind so
 * the cache key for each call type is stable.
 *
 * IMPORTANT: keep all SYSTEM_PROMPT_* strings BYTE-stable. Any change busts
 * the cache.
 */
const EXTRACTION_RUBRIC = `Extraction goals, in priority order:
1. PEOPLE: every named individual mentioned (sender, recipient, recruiter, hiring manager, interviewer, referral). Include their email if you can read it off the message. Include their role and the company they work at if either is mentioned.
2. COMPANIES: every employer or platform named. Distinguish employer (the company hiring) from platforms (LinkedIn, Greenhouse, etc.). Include the company's web domain only if you see it verbatim in the message.
3. DATES: any time-pinned event — interview slots, deadlines, follow-up dates. Convert relative phrases ("next Tuesday at 3pm") to ISO 8601 using the provided anchor timestamp. Include a short context snippet (~10 words around the date in the original text).
4. STAGE SIGNAL: if the message implies the application moved between pipeline stages — applied, screen scheduled, interview scheduled, offer extended, rejected, accepted — emit a stageSignal with one of {lead, applied, screen, interview, offer, closed_won, closed_lost} and a confidence in [0,1]. Reject/decline => closed_lost. Offer accepted => closed_won. If unsure, OMIT the signal rather than guessing.
5. RELATIONSHIPS: contact->company links you can confidently infer from the message content. Use one of {works_at, recruited_for, introduced_by, colleague_of}. ALWAYS include a verbatim sourceQuote — the snippet of the message that supports the inference. Confidence in [0,1].
6. SUMMARY: one sentence (<25 words) describing what this message means for the job search.

Rules:
- NEVER invent names, emails, dates, or quotes. If the message doesn't say it, leave the field out.
- Confidence calibration: 0.9+ means "the message states this plainly"; 0.5–0.8 means "strong inference from one signal"; below 0.5, omit the candidate entirely.
- Return ALL findings in a single call to the record_extraction tool. Do not write commentary outside the tool call.`;

const SYSTEM_PROMPT_EMAIL = `You are an information-extraction assistant for a job-search CRM.

You receive one email at a time — usually from a recruiter, hiring manager, or job platform — and must return a structured summary that downstream automation can use to update an application pipeline.

${EXTRACTION_RUBRIC}

Email-specific guidance:
- If only metadata (sender + subject) is available, still extract what you can — the sender's address often tells you their company; the subject often signals stage.`;

const SYSTEM_PROMPT_FREE_TEXT = `You are an information-extraction assistant for a job-search CRM.

You receive a short note the user typed about a person they met, a company they're tracking, or a conversation they had. Treat it as first-person factual input from a trusted source. Return a structured summary that downstream automation can use to populate the user's contact graph.

${EXTRACTION_RUBRIC}

Free-text-specific guidance:
- A free-text note rarely implies a pipeline stage transition. Most calls SHOULD omit stageSignal. Only emit one if the note explicitly mentions submitting an application, an interview being scheduled, an offer being received, or a rejection.
- The sourceQuote for each relationship must be a verbatim snippet of the note (not paraphrased).
- The note may name several people at the same company; emit one relationship per (contact, company) pair.`;

/**
 * Input schema for the `record_extraction` tool. This is sent to the model
 * verbatim, so the field descriptions matter — they're the model's only
 * spec. Mirrors `emailExtractionSchema` in `src/lib/llm/types.ts`; if you
 * change one, change the other.
 *
 * Shared verbatim across email + free-text calls so prompt caching covers
 * both paths.
 */
const TOOL_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    people: {
      type: "array",
      description: "Every named individual mentioned in the message.",
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
      description: "Every employer or platform named in the message.",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          domain: {
            type: "string",
            description: "Only if the domain appears verbatim in the message.",
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
              "ISO 8601 timestamp. Resolve relative phrases against the message timestamp.",
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
        "Emit only if the message implies a stage transition. Omit if unsure.",
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
        "Contact->company links inferred from the message. ALWAYS include a verbatim sourceQuote.",
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
        "One sentence (<25 words) describing what this message means for the job search.",
    },
  },
  required: ["people", "companies", "dates", "relationships", "summary"],
  additionalProperties: false,
};

/**
 * Build the user message for an email — the per-email payload that's NOT
 * cached. Kept short and structured so the model never confuses metadata
 * with body.
 */
function buildEmailUserMessage(input: EmailExtractionInput): string {
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
 * Build the user message for a free-text capture. The anchor timestamp goes
 * up front so the model can resolve "yesterday" / "last Thursday" if the
 * note has them.
 */
function buildFreeTextUserMessage(input: FreeTextExtractionInput): string {
  return [
    `capturedAt: ${input.capturedAt.toISOString()}`,
    "---",
    input.text,
  ].join("\n");
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
 * Single funnel for the upstream call + tool_use parse + zod validation.
 * Both extractor methods route through here; the only differences are the
 * system prompt and the user-message string.
 */
async function runExtraction(
  systemPrompt: string,
  userMessage: string,
): Promise<EmailExtraction> {
  const client = getClient();

  const response = await client.messages.create({
    model: MODEL_ID,
    max_tokens: MAX_OUTPUT_TOKENS,
    // System prompt is cached; the tool definition is also cached (the
    // tool array sits before the per-message content in the cache window).
    system: [
      {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [
      {
        name: TOOL_NAME,
        description:
          "Record the structured extraction for one message. Always call this exactly once.",
        input_schema: TOOL_INPUT_SCHEMA,
        cache_control: { type: "ephemeral" },
      },
    ],
    // Force the model to invoke our tool — no free-text fallback.
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [{ role: "user", content: userMessage }],
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
      return runExtraction(SYSTEM_PROMPT_EMAIL, buildEmailUserMessage(input));
    },

    async extractFromFreeText(
      input: FreeTextExtractionInput,
    ): Promise<EmailExtraction> {
      if (!input.text || input.text.trim().length === 0) {
        throw new Error(
          "extractFromFreeText: `text` must be non-empty; refusing to burn tokens on an empty note.",
        );
      }
      return runExtraction(
        SYSTEM_PROMPT_FREE_TEXT,
        buildFreeTextUserMessage(input),
      );
    },
  };
}
