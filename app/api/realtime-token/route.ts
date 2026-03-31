export async function GET() {
  const apiKey = process.env.ASSEMBLYAI_API_KEY?.trim();
  if (!apiKey) {
    return Response.json({ error: "AssemblyAI API key not configured." }, { status: 500 });
  }

  // Return the API key as the token — the client passes it via ?api_key= in the WebSocket URL.
  // The key stays out of the client bundle; the route is protected by session middleware.
  return Response.json({ token: apiKey });
}
