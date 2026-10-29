import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  generateText,
  streamText,
  wrapLanguageModel,
  tool,
  isStepCount,
  Output,
  toUIMessageStream,
  readUIMessageStream,
  convertToModelMessages,
} from "ai";
import { MockLanguageModelV4 } from "ai/test";
import type {
  LanguageModelV4GenerateResult,
  LanguageModelV4Usage,
} from "@ai-sdk/provider";
import { z } from "zod";

vi.mock("../src/wilson", () => ({ reportLlmUsage: vi.fn() }));
import { reportLlmUsage } from "../src/wilson";
import { createWilsonMiddleware } from "../src/llm-tracking";

const usage: LanguageModelV4Usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 3, text: 3, reasoning: 0 },
};
const context = {
  userId: "test-user",
  userTier: "creator",
  featureName: "chat",
  trigger: "user" as const,
};
const result = (text: string): LanguageModelV4GenerateResult => ({
  content: [{ type: "text", text }],
  finishReason: { unified: "stop", raw: "stop" },
  usage,
  warnings: [],
});

beforeEach(() => vi.clearAllMocks());

describe("AI SDK 7 application contracts", () => {
  it("preserves structured output and reports provider v4 usage", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: result('{"title":"A useful title"}'),
    });
    const generated = await generateText({
      model: wrapLanguageModel({
        model,
        middleware: createWilsonMiddleware(context),
      }),
      instructions: "Return a title.",
      prompt: "Draft",
      output: Output.object({ schema: z.object({ title: z.string() }) }),
    });
    expect(generated.output).toEqual({ title: "A useful title" });
    expect(model.doGenerateCalls[0].prompt[0]).toMatchObject({
      role: "system",
      content: "Return a title.",
    });
    expect(reportLlmUsage).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        inputTokens: 10,
        outputTokens: 3,
        userId: "test-user",
      }),
    );
  });

  it.each([false, true])(
    "keeps tool continuation and whole-run usage when tool failure is %s",
    async (fail) => {
      const execute = vi.fn(async () => {
        if (fail) throw new Error("Tool unavailable");
        return "Saved";
      });
      const model = new MockLanguageModelV4({
        doGenerate: [
          {
            ...result(""),
            content: [
              {
                type: "tool-call",
                toolCallId: "call-1",
                toolName: "save",
                input: "{}",
              },
            ],
            finishReason: { unified: "tool-calls", raw: "tool_use" },
          },
          result(fail ? "Please retry." : "Draft saved."),
        ],
      });
      const generated = await generateText({
        model: wrapLanguageModel({
          model,
          middleware: createWilsonMiddleware(context),
        }),
        prompt: "Save the draft.",
        stopWhen: isStepCount(2),
        tools: { save: tool({ inputSchema: z.object({}), execute }) },
      });
      expect(execute).toHaveBeenCalledOnce();
      expect(generated.steps).toHaveLength(2);
      expect(generated.text).toBe(fail ? "Please retry." : "Draft saved.");
      expect(generated.usage.inputTokens).toBe(20);
      expect(reportLlmUsage).toHaveBeenCalledTimes(2);
      expect(model.doGenerateCalls[1].prompt).toEqual(
        expect.arrayContaining([expect.objectContaining({ role: "tool" })]),
      );
    },
  );

  it("streams text through the UI protocol, completes the turn, and replays persisted messages", async () => {
    const onEnd = vi.fn();
    const model = new MockLanguageModelV4({
      doStream: {
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "stream-start", warnings: [] });
            controller.enqueue({ type: "text-start", id: "text-1" });
            controller.enqueue({
              type: "text-delta",
              id: "text-1",
              delta: "Draft ready.",
            });
            controller.enqueue({ type: "text-end", id: "text-1" });
            controller.enqueue({
              type: "finish",
              finishReason: { unified: "stop", raw: "stop" },
              usage,
            });
            controller.close();
          },
        }),
      },
    });
    const generated = streamText({
      model: wrapLanguageModel({
        model,
        middleware: createWilsonMiddleware(context),
      }),
      prompt: "Write.",
      onEnd,
    });
    const messages = [];
    for await (const message of readUIMessageStream({
      stream: toUIMessageStream({ stream: generated.stream }),
    }))
      messages.push(message);
    const final = messages.at(-1)!;
    expect(final.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "text", text: "Draft ready." }),
      ]),
    );
    expect(onEnd).toHaveBeenCalledOnce();
    expect(reportLlmUsage).toHaveBeenCalledOnce();
    expect(await convertToModelMessages([final])).toEqual([
      { role: "assistant", content: [{ type: "text", text: "Draft ready." }] },
    ]);
  });
});
