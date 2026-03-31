function extFromMimeType(mimeType: string): string {
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mp4")) return "mp4";
  return "webm";
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const audio = formData.get("audio") as Blob | null;

    if (!audio || audio.size === 0) {
      return Response.json({ text: "" });
    }

    const ext = extFromMimeType(audio.type);
    const file = new File([audio], `audio.${ext}`, { type: audio.type });

    const body = new FormData();
    body.append("file", file);
    body.append("model", "whisper-large-v3-turbo");
    body.append("response_format", "json");
    body.append("language", "en");

    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body,
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Groq error:", res.status, err);
      return Response.json({ error: err }, { status: 500 });
    }

    const data = (await res.json()) as { text?: string };
    const text = data.text?.trim() ?? "";

    // Discard known Whisper hallucinations on silence
    const HALLUCINATIONS = ["thank you", "thanks for watching", "subtitles by", "www.", ".com"];
    const lower = text.toLowerCase();
    if (HALLUCINATIONS.some((h) => lower.includes(h)) && text.split(/\s+/).length < 5) {
      return Response.json({ text: "" });
    }

    return Response.json({ text });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Transcribe error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
