import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { ANALYZE_SYSTEM_PROMPT, buildAnalyzeUserMessage } from "@/lib/prompts";
import type { OrderResult } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: settings } = await supabase
      .from("user_settings")
      .select("anthropic_api_key")
      .eq("user_id", user.id)
      .single();

    if (!settings?.anthropic_api_key) {
      return Response.json({ error: "Anthropic API key not configured" }, { status: 400 });
    }

    const { transcript, peopleCount } = (await request.json()) as {
      transcript: string;
      peopleCount: number;
    };

    const client = new Anthropic({ apiKey: settings.anthropic_api_key });

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
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
    return Response.json({ error: "Analysis failed" }, { status: 500 });
  }
}
