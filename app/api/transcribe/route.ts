export const maxDuration = 30;

const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY!;

function normalizeAudioType(mimeType: string): { ext: string; type: string } {
  if (mimeType.includes("ogg")) return { ext: "ogg", type: "audio/ogg" };
  if (mimeType.includes("mp4")) return { ext: "mp4", type: "audio/mp4" };
  return { ext: "webm", type: "audio/webm" };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const audio = formData.get("audio") as Blob | null;
    if (!audio || audio.size === 0) return Response.json({ text: "" });

    const { ext, type } = normalizeAudioType(audio.type);
    const file = new File([audio], `audio.${ext}`, { type });

    // 1. Upload audio to AssemblyAI CDN
    const uploadRes = await fetch("https://api.assemblyai.com/v2/upload", {
      method: "POST",
      headers: {
        Authorization: ASSEMBLYAI_API_KEY,
        "Content-Type": type,
      },
      body: file,
    });
    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      return Response.json({ error: `Upload failed: ${err}` }, { status: 500 });
    }
    const { upload_url } = (await uploadRes.json()) as { upload_url: string };

    // 2. Submit transcription job
    const submitRes = await fetch("https://api.assemblyai.com/v2/transcript", {
      method: "POST",
      headers: {
        Authorization: ASSEMBLYAI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        audio_url: upload_url,
        speech_model: "nano",
        language_code: "en",
      }),
    });
    if (!submitRes.ok) {
      const err = await submitRes.text();
      return Response.json({ error: `Submit failed: ${err}` }, { status: 500 });
    }
    const { id } = (await submitRes.json()) as { id: string };

    // 3. Poll until completed (max ~25 seconds)
    const deadline = Date.now() + 25000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 750));
      const pollRes = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
        headers: { Authorization: ASSEMBLYAI_API_KEY },
      });
      const data = (await pollRes.json()) as {
        status: string;
        text?: string;
        error?: string;
      };
      if (data.status === "completed") {
        const text = data.text?.trim() ?? "";
        // Discard common Whisper hallucinations on silence
        const lower = text.toLowerCase();
        const HALLUCINATIONS = ["thank you", "thanks for watching", "subtitles by", "www.", ".com"];
        if (HALLUCINATIONS.some((h) => lower.includes(h)) && text.split(/\s+/).length < 5) {
          return Response.json({ text: "" });
        }
        return Response.json({ text });
      }
      if (data.status === "error") {
        return Response.json({ error: data.error ?? "Transcription error" }, { status: 500 });
      }
    }
    return Response.json({ error: "Transcription timed out" }, { status: 500 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
