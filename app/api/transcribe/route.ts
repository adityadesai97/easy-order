import Groq from "groq-sdk";

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

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const transcription = await groq.audio.transcriptions.create({
      file,
      model: "whisper-large-v3-turbo",
      response_format: "json",
      language: "en",
    });

    const text = transcription.text?.trim() ?? "";

    // Discard Whisper hallucinations on silence (fewer than 3 words)
    if (text.split(/\s+/).filter(Boolean).length < 3) {
      return Response.json({ text: "" });
    }

    return Response.json({ text });
  } catch (err) {
    console.error("Transcribe error:", err);
    return Response.json({ error: "Transcription failed" }, { status: 500 });
  }
}
