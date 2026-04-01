export const dynamic = "force-dynamic";

const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY?.trim();
const TOKEN_TTL_SECONDS = 600;

export async function GET() {
  try {
    if (!ASSEMBLYAI_API_KEY) {
      return Response.json(
        { error: "AssemblyAI API key is not configured on the server." },
        { status: 500 }
      );
    }

    const res = await fetch(
      `https://streaming.assemblyai.com/v3/token?expires_in_seconds=${TOKEN_TTL_SECONDS}`,
      {
        headers: { Authorization: ASSEMBLYAI_API_KEY },
      }
    );

    if (!res.ok) {
      const errorText = await res.text();
      return Response.json(
        { error: `Failed to mint realtime token: ${errorText}` },
        { status: 500 }
      );
    }

    const data = (await res.json()) as { token: string };
    return Response.json(
      { token: data.token, expiresAt: Date.now() + TOKEN_TTL_SECONDS * 1000 },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
