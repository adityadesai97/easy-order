import Groq from "groq-sdk";
import { createClient } from "@/lib/supabase/server";

function extFromMimeType(mimeType: string): string {
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mp4")) return "mp4";
  return "webm";
}

export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: settings } = await supabase
      .from("user_settings")
      .select("groq_api_key")
      .eq("user_id", user.id)
      .single();

    if (!settings?.groq_api_key) {
      return Response.json({ error: "Groq API key not configured" }, { status: 400 });
    }

    const formData = await request.formData();
    const audio = formData.get("audio") as Blob | null;

    if (!audio || audio.size === 0) {
      return Response.json({ text: "" });
    }

    const ext = extFromMimeType(audio.type);
    const file = new File([audio], `audio.${ext}`, { type: audio.type });

    const groq = new Groq({ apiKey: settings.groq_api_key });
    const transcription = await groq.audio.transcriptions.create({
      file,
      model: "whisper-large-v3-turbo",
      response_format: "json",
      language: "en",
    });

    const text = transcription.text?.trim() ?? "";

    if (text.split(/\s+/).filter(Boolean).length < 3) {
      return Response.json({ text: "" });
    }

    return Response.json({ text });
  } catch (err) {
    console.error("Transcribe error:", err);
    return Response.json({ error: "Transcription failed" }, { status: 500 });
  }
}
