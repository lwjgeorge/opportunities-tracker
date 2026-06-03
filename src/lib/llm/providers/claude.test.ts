import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  emailExtractionSchema,
  type EmailExtraction,
} from "@/lib/llm/types";

/**
 * Test strategy: we do NOT call the real Anthropic API. Instead we mock the
 * `@anthropic-ai/sdk` default export with a class whose `messages.create`
 * captures the request and returns a stubbed `tool_use` response. That lets
 * us assert three high-value things without spending a token:
 *
 *   1. The zod schema accepts realistic extraction shapes and rejects
 *      malformed ones (model drift would fail this at runtime).
 *   2. The provider forces tool use (no free-text fallback path).
 *   3. The provider parses the tool_use payload and surfaces a clear error
 *      when zod rejects it.
 *
 * Schema-only tests live in the first describe; the SDK-coupled tests use
 * vi.doMock + dynamic import so each test gets a fresh module-level client.
 */

const VALID: EmailExtraction = {
  people: [
    { name: "Alice Doe", email: "alice@example.com", role: "Recruiter" },
  ],
  companies: [{ name: "ExampleCo", domain: "example.com" }],
  dates: [
    {
      iso: "2026-06-04T15:00:00Z",
      context: "phone screen this Thursday at 3pm",
    },
  ],
  stageSignal: {
    toStage: "screen",
    confidence: 0.92,
    reason: "Recruiter is scheduling a screen call.",
  },
  relationships: [
    {
      contact: { name: "Alice Doe", email: "alice@example.com" },
      company: { name: "ExampleCo" },
      role: "Recruiter",
      relation: "works_at",
      confidence: 0.97,
      sourceQuote: "Alice from ExampleCo recruiting",
    },
  ],
  summary: "Recruiter at ExampleCo scheduling a phone screen.",
};

describe("emailExtractionSchema", () => {
  it("accepts a fully-populated valid extraction", () => {
    const parsed = emailExtractionSchema.safeParse(VALID);
    expect(parsed.success).toBe(true);
  });

  it("accepts a minimal extraction (empty arrays, no stage signal)", () => {
    const minimal = {
      people: [],
      companies: [],
      dates: [],
      relationships: [],
      summary: "Marketing newsletter, ignore.",
    };
    expect(emailExtractionSchema.safeParse(minimal).success).toBe(true);
  });

  it("rejects confidence > 1", () => {
    const bad = {
      ...VALID,
      relationships: [
        { ...VALID.relationships[0], confidence: 1.5 },
      ],
    };
    expect(emailExtractionSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an unknown stage value", () => {
    const bad = {
      ...VALID,
      stageSignal: {
        toStage: "phone_call",
        confidence: 0.9,
        reason: "made-up stage",
      },
    };
    expect(emailExtractionSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an unknown relation type", () => {
    const bad = {
      ...VALID,
      relationships: [
        {
          ...VALID.relationships[0],
          relation: "best_friend",
        },
      ],
    };
    expect(emailExtractionSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects when the required summary field is missing", () => {
    const bad: Record<string, unknown> = { ...VALID };
    delete bad.summary;
    expect(emailExtractionSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an empty contact name", () => {
    const bad = {
      ...VALID,
      relationships: [
        {
          ...VALID.relationships[0],
          contact: { name: "" },
        },
      ],
    };
    expect(emailExtractionSchema.safeParse(bad).success).toBe(false);
  });
});

// --- Provider-level tests with the SDK mocked -----------------------------

// Wide-shape capture for the args the SDK is called with. Tests only assert
// on a handful of top-level fields, so `Record<string, unknown>` is enough.
type CreateArgsShape = Record<string, unknown>;

function setupAnthropicMock(toolUseInput: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const createMock = vi.fn(async (_args: CreateArgsShape) => ({
    id: "msg_test",
    stop_reason: "tool_use",
    content: [
      {
        type: "tool_use" as const,
        id: "tu_test",
        name: "record_extraction",
        input: toolUseInput,
      },
    ],
  }));

  vi.doMock("@anthropic-ai/sdk", () => {
    class MockAnthropic {
      messages = { create: createMock };
    }
    return { default: MockAnthropic };
  });

  return createMock;
}

describe("createClaudeLlmExtractor", () => {
  const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock("@anthropic-ai/sdk");
    if (ORIGINAL_KEY === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
    }
  });

  it("parses a valid tool_use response and returns the extraction", async () => {
    const createMock = setupAnthropicMock(VALID);
    const { createClaudeLlmExtractor } = await import("./claude");

    const extractor = createClaudeLlmExtractor();
    const result = await extractor.extractFromEmail({
      sender: "alice@example.com",
      subject: "phone screen this week?",
      bodyText: null,
      sentAt: new Date("2026-06-01T10:00:00Z"),
    });

    expect(result).toEqual(VALID);
    expect(extractor.name).toBe("claude-sonnet-4-6");

    // Verify the provider forces tool use and ships the cache_control flag
    // on both system + tool — losing either bricks the caching strategy.
    const args = createMock.mock.calls[0][0] as Record<string, unknown>;
    expect(args.tool_choice).toEqual({
      type: "tool",
      name: "record_extraction",
    });
    expect(Array.isArray(args.system)).toBe(true);
    const system = args.system as Array<Record<string, unknown>>;
    expect(system[0].cache_control).toEqual({ type: "ephemeral" });
    const tools = args.tools as Array<Record<string, unknown>>;
    expect(tools[0].cache_control).toEqual({ type: "ephemeral" });
  });

  it("includes the metadata-only fallback marker when bodyText is null", async () => {
    const createMock = setupAnthropicMock(VALID);
    const { createClaudeLlmExtractor } = await import("./claude");

    await createClaudeLlmExtractor().extractFromEmail({
      sender: "alice@example.com",
      subject: "intro",
      bodyText: null,
      sentAt: new Date("2026-06-01T10:00:00Z"),
    });

    const args = createMock.mock.calls[0][0] as Record<string, unknown>;
    const messages = args.messages as Array<{ role: string; content: string }>;
    expect(messages[0].content).toContain("(body not available");
    expect(messages[0].content).toContain("alice@example.com");
  });

  it("throws a descriptive error when the tool_use payload fails schema validation", async () => {
    setupAnthropicMock({
      // Missing required fields like `summary`, `relationships`, etc.
      people: [{ name: "Alice" }],
    });
    const { createClaudeLlmExtractor } = await import("./claude");

    await expect(
      createClaudeLlmExtractor().extractFromEmail({
        sender: "alice@example.com",
        subject: "hello",
        bodyText: null,
        sentAt: new Date("2026-06-01T10:00:00Z"),
      }),
    ).rejects.toThrow(/schema validation/i);
  });

  it("throws when the response has no tool_use block", async () => {
    vi.doMock("@anthropic-ai/sdk", () => {
      class MockAnthropic {
        messages = {
          create: vi.fn(async () => ({
            id: "msg_test",
            stop_reason: "end_turn",
            content: [{ type: "text", text: "I cannot do that." }],
          })),
        };
      }
      return { default: MockAnthropic };
    });
    const { createClaudeLlmExtractor } = await import("./claude");

    await expect(
      createClaudeLlmExtractor().extractFromEmail({
        sender: "alice@example.com",
        subject: "hi",
        bodyText: null,
        sentAt: new Date(),
      }),
    ).rejects.toThrow(/tool_use/);
  });

  it("throws a clear error if ANTHROPIC_API_KEY is unset", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    // Anthropic SDK still needs to be mockable so the factory doesn't pull
    // the real one during dynamic import.
    vi.doMock("@anthropic-ai/sdk", () => {
      class MockAnthropic {
        messages = { create: vi.fn() };
      }
      return { default: MockAnthropic };
    });
    const { createClaudeLlmExtractor } = await import("./claude");

    await expect(
      createClaudeLlmExtractor().extractFromEmail({
        sender: "alice@example.com",
        subject: "hi",
        bodyText: null,
        sentAt: new Date(),
      }),
    ).rejects.toThrow(/ANTHROPIC_API_KEY is not set/);
  });
});
