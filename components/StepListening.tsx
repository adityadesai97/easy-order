"use client";

import { useEffect, useRef, useState } from "react";

const SAMPLE_RATE = 16_000;
const TOKEN_REFRESH_MS = 500_000; // refresh at 500s; token lifetime is 600s

interface Props {
  onComplete: (transcript: string) => void;
}

export default function StepListening({ onComplete }: Props) {
  const [partialTranscript, setPartialTranscript] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFlushing, setIsFlushing] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const finalTranscriptRef = useRef("");
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = useRef(false);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  // Call onComplete exactly once
  const complete = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    onCompleteRef.current(finalTranscriptRef.current);
  };

  const connectWebSocket = (token: string) => {
    if (stoppedRef.current) return;

    const ws = new WebSocket(
      `wss://streaming.assemblyai.com/v3/ws?sample_rate=${SAMPLE_RATE}&speech_model=u3-rt-pro&token=${token}`
    );
    wsRef.current = ws;

    ws.onopen = () => {
      if (!stoppedRef.current) setIsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as {
          type: string;
          transcript?: string;
          turn_is_formatted?: boolean;
        };

        if (msg.type === "Turn") {
          if (msg.turn_is_formatted) {
            // Final turn — commit to accumulated transcript
            const text = msg.transcript?.trim() ?? "";
            if (text) {
              finalTranscriptRef.current = finalTranscriptRef.current
                ? finalTranscriptRef.current + " " + text
                : text;
              setFinalTranscript(finalTranscriptRef.current);
            }
            setPartialTranscript("");
          } else {
            // Partial turn — show live in gray
            setPartialTranscript(msg.transcript ?? "");
          }
        } else if (msg.type === "Termination") {
          if (stoppedRef.current) complete();
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onerror = () => {
      if (!stoppedRef.current) setIsConnected(false);
    };

    ws.onclose = () => {
      if (!stoppedRef.current) setIsConnected(false);
    };
  };

  const scheduleTokenRefresh = () => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(async () => {
      if (stoppedRef.current) return;
      try {
        // Silently replace the WebSocket before the token expires
        const oldWs = wsRef.current;
        if (oldWs) {
          oldWs.onmessage = null;
          oldWs.onclose = null;
          oldWs.onerror = null;
          oldWs.close();
        }
        setIsConnected(false);

        const res = await fetch("/api/realtime-token");
        if (!res.ok) throw new Error("token fetch failed");
        const { token } = (await res.json()) as { token: string };

        connectWebSocket(token);
        scheduleTokenRefresh(); // schedule the next refresh
      } catch {
        // Refresh failed — keep existing connection; it may expire at 600s
      }
    }, TOKEN_REFRESH_MS);
  };

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Microphone not supported in this browser.");
      return;
    }

    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({ audio: true, video: false })
      .then(async (stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        // Set up AudioContext resampled to 16 kHz
        const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
        audioContextRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const processor = ctx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
          const ws = wsRef.current;
          if (ws?.readyState !== WebSocket.OPEN) return;
          const floats = e.inputBuffer.getChannelData(0);
          const int16 = new Int16Array(floats.length);
          for (let i = 0; i < floats.length; i++) {
            int16[i] = Math.max(-32768, Math.min(32767, Math.round(floats[i] * 32767)));
          }
          ws.send(int16.buffer);
        };

        source.connect(processor);
        processor.connect(ctx.destination);

        // Fetch token and connect — fresh token each time the component mounts
        try {
          const res = await fetch("/api/realtime-token");
          if (!res.ok) throw new Error("token fetch failed");
          const { token } = (await res.json()) as { token: string };
          if (!cancelled) {
            connectWebSocket(token);
            scheduleTokenRefresh();
          }
        } catch {
          if (!cancelled) setError("Could not connect to transcription service.");
        }

        if (!cancelled) {
          timerRef.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const name = (e as { name?: string }).name;
        setError(
          name === "NotAllowedError"
            ? "Microphone access was denied. Please allow microphone access and try again."
            : "Could not access microphone. Please check your device settings."
        );
      });

    return () => {
      cancelled = true;
      stoppedRef.current = true;
      if (timerRef.current) clearInterval(timerRef.current);
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      processorRef.current?.disconnect();
      audioContextRef.current?.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "Terminate" }));
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [finalTranscript, partialTranscript]);

  const handleDone = () => {
    stoppedRef.current = true;
    setIsFlushing(true);
    if (timerRef.current) clearInterval(timerRef.current);
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);

    processorRef.current?.disconnect();
    audioContextRef.current?.close();
    streamRef.current?.getTracks().forEach((t) => t.stop());

    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "Terminate" }));
      // Fallback: complete after 3s if Termination message never arrives
      setTimeout(complete, 3000);
    } else {
      complete();
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  if (error) {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center text-2xl">!</div>
        <p className="text-gray-700 max-w-xs">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 w-full max-w-md mx-auto">
      <div className="flex flex-col items-center gap-2">
        <div
          className={`w-16 h-16 rounded-full flex items-center justify-center ${
            isConnected ? "bg-red-500 animate-pulse" : "bg-gray-300"
          }`}
        >
          <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm-1 16.93V20H9v2h6v-2h-2v-2.07A8.001 8.001 0 0 0 20 11h-2a6 6 0 0 1-12 0H4a8.001 8.001 0 0 0 7 7.93z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-gray-700">
          {isConnected ? "Listening..." : "Connecting..."}
        </p>
        <p className="text-xs text-gray-400">{formatTime(elapsedSeconds)}</p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
        <div className="px-4 py-2 border-b border-gray-200">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Live Transcript
          </span>
        </div>
        <div className="h-48 overflow-y-auto px-4 py-3">
          {finalTranscript || partialTranscript ? (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              <span className="text-gray-700">{finalTranscript}</span>
              {partialTranscript && (
                <span className="text-gray-400">
                  {finalTranscript ? " " : ""}
                  {partialTranscript}
                </span>
              )}
            </p>
          ) : (
            <p className="text-sm text-gray-400 italic">Waiting for speech...</p>
          )}
          <div ref={transcriptEndRef} />
        </div>
      </div>

      <p className="text-xs text-gray-400 text-center">
        When everyone has finished ordering, tap Done.
      </p>

      <button
        onClick={handleDone}
        disabled={isFlushing}
        className="w-full rounded-lg bg-gray-900 px-6 py-4 text-lg font-semibold text-white hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isFlushing ? "Processing..." : "Done"}
      </button>
    </div>
  );
}
