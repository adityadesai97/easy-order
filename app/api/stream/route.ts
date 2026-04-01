export const runtime = "edge";

export function GET(request: Request) {
  if (request.headers.get("upgrade") !== "websocket") {
    return new Response("Expected WebSocket upgrade", { status: 426 });
  }

  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    return new Response("API key not configured", { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { 0: clientSocket, 1: serverSocket } = new (globalThis as any).WebSocketPair();
  serverSocket.accept();

  // Connect to AssemblyAI server-side — Authorization header is allowed here
  const upstream = new WebSocket(
    "wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&speech_model=u3-rt-pro",
    { headers: { Authorization: apiKey } } as unknown as string[]
  );

  // Browser → AssemblyAI
  serverSocket.addEventListener("message", (event: MessageEvent) => {
    if (upstream.readyState === WebSocket.OPEN) {
      upstream.send(event.data);
    }
  });

  serverSocket.addEventListener("close", (event: CloseEvent) => {
    if (upstream.readyState < WebSocket.CLOSING) {
      upstream.close(event.code, event.reason);
    }
  });

  // AssemblyAI → Browser
  upstream.addEventListener("message", (event: MessageEvent) => {
    if (serverSocket.readyState === WebSocket.OPEN) {
      serverSocket.send(event.data);
    }
  });

  upstream.addEventListener("close", (event: CloseEvent) => {
    if (serverSocket.readyState === WebSocket.OPEN) {
      serverSocket.close(event.code, event.reason);
    }
  });

  upstream.addEventListener("error", () => {
    if (serverSocket.readyState === WebSocket.OPEN) {
      serverSocket.close(1011, "upstream error");
    }
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Response(null, { status: 101, webSocket: clientSocket } as any);
}
