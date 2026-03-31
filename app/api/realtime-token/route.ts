export async function GET() {
  const apiKey = process.env.ASSEMBLYAI_API_KEY?.trim();
  if (!apiKey) {
    return Response.json({ error: "AssemblyAI API key not configured." }, { status: 500 });
  }

  const res = await fetch("https://api.assemblyai.com/v2/realtime/token", {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expires_in: 3600 }),
  });

  if (!res.ok) {
    const err = await res.text();
    return Response.json({ error: err }, { status: 500 });
  }

  const data = (await res.json()) as { token: string };
  return Response.json({ token: data.token });
}
