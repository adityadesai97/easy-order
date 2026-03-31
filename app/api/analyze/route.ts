import Anthropic from "@anthropic-ai/sdk";
import { ANALYZE_SYSTEM_PROMPT, buildAnalyzeUserMessage } from "@/lib/prompts";
import type { OrderResult } from "@/lib/types";

const ANALYZE_MODEL =
  process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-20250514";

export async function POST(request: Request) {
  try {
    const { transcript, peopleCount } = (await request.json()) as {
      transcript: string;
      peopleCount: number;
    };

    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      return Response.json(
        { error: "Anthropic API key is not configured on the server." },
        { status: 500 }
      );
    }

    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: ANALYZE_MODEL,
      max_tokens: 1024,
      system: ANALYZE_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: buildAnalyzeUserMessage(
            transcript || "(no transcript captured)",
            peopleCount
          ),
        },
      ],
    });

    const raw =
      response.content[0].type === "text" ? response.content[0].text : "";

    const cleaned = raw
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();

    const result = JSON.parse(cleaned) as OrderResult;
    return Response.json(result);
  } catch (err) {
    console.error("Analyze error:", err);
    const errorMessage =
      err instanceof Error ? err.message : "Analysis failed.";
    return Response.json({ error: errorMessage }, { status: 500 });
  }
}
