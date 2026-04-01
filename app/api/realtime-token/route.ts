import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const res = await fetch(
    "https://streaming.assemblyai.com/v3/token?expires_in_seconds=600",
    { headers: { Authorization: process.env.ASSEMBLYAI_API_KEY! } }
  );
  if (!res.ok) {
    return NextResponse.json({ error: "Failed to get token" }, { status: 502 });
  }
  const data = (await res.json()) as { token: string };
  return NextResponse.json({ token: data.token });
}
