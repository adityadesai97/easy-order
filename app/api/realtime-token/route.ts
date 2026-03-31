export const dynamic = "force-dynamic";

export async function GET() {
  const apiKey = process.env.ASSEMBLYAI_API_KEY?.trim();
  if (!apiKey) {
    return Response.json({ error: "AssemblyAI API key not configured." }, { status: 500 });
  }

  const res = await fetch(
    "https://streaming.assemblyai.com/v3/token?expires_in_seconds=600",
    { headers: { Authorization: apiKey } }
  );

  if (!res.ok) {
    const err = await res.text();
    return Response.json({ error: err }, { status: 500 });
  }

  const data = (await res.json()) as { token: string };
  return Response.json({ token: data.token });
}
