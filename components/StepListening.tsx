"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface Props {
  onComplete: (transcript: string) => void;
}

export default function StepListening({ onComplete }: Props) {
  const [finalTranscript, setFinalTranscript] = useState("");
  const [partialText, setPartialText] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFlushing, setIsFlushing] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const finalRef = useRef("");
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const appendFinal = useCallback((text: string) => {
    if (!text.trim()) return;
    finalRef.current = finalRef.current
      ? finalRef.current + " " + text.trim()
      : text.trim();
    setFinalTranscript(finalRef.current);
    setPartialText("");
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      // 1. Get temporary token (keeps API key server-side)
      let token: string;
      try {
        const res = await fetch("/api/realtime-token");
        if (!res.ok) throw new Error("token fetch failed");
        const data = (await res.json()) as { token?: string; error?: string };
        if (!data.token) throw new Error(data.error ?? "no token");
        token = data.token;
      } catch {
        if (!cancelled) setError("Could not connect to transcription service. Please try again.");
        return;
      }

      if (cancelled) return;

      // 2. Request microphone
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        streamRef.current = stream;
      } catch (e: unknown) {
        if (cancelled) return;
        const name = (e as { name?: string }).name;
        if (name === "NotAllowedError") {
          setError("Microphone access was denied. Please allow microphone access and try again.");
        } else {
          setError("Could not access microphone. Please check your device settings.");
        }
        return;
      }

      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      // 3. Set up audio pipeline: getUserMedia → AudioContext (16 kHz) → ScriptProcessor → PCM Int16
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      // 4. Open AssemblyAI real-time WebSocket
      const ws = new WebSocket(
        `wss://api.assemblyai.com/v2/realtime/ws?sample_rate=16000&token=${token}`
      );
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) { ws.close(); return; }
        setIsConnected(true);
        timerRef.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);

        processor.onaudioprocess = (e) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const float32 = e.inputBuffer.getChannelData(0);
          const int16 = new Int16Array(float32.length);
          for (let i = 0; i < float32.length; i++) {
            int16[i] = Math.max(-32768, Math.min(32767, Math.round(float32[i] * 32767)));
          }
          ws.send(int16.buffer);
        };

        source.connect(processor);
        processor.connect(audioContext.destination);
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data as string) as {
          message_type: string;
          text?: string;
        };
        if (msg.message_type === "FinalTranscript" && msg.text) {
          appendFinal(msg.text);
        } else if (msg.message_type === "PartialTranscript") {
          setPartialText(msg.text ?? "");
        } else if (msg.message_type === "SessionTerminated") {
          onCompleteRef.current(finalRef.current);
        }
      };

      ws.onerror = () => {
        if (!cancelled) setError("Transcription connection error. Please try again.");
      };

      ws.onclose = (event) => {
        setIsConnected(false);
        if (!cancelled && !isFlushing && event.code !== 1000 && event.code !== 1001) {
          setError(`Connection closed unexpectedly (${event.code}). Please try again.`);
        }
      };
    }

    start();

    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
      processorRef.current?.disconnect();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioContextRef.current?.close();
      if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appendFinal]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [finalTranscript, partialText]);

  const handleDone = () => {
    setIsFlushing(true);
    if (timerRef.current) clearInterval(timerRef.current);
    processorRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((t) => t.stop());

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // Ask AssemblyAI to flush and terminate; onmessage SessionTerminated fires onComplete
      wsRef.current.send(JSON.stringify({ terminate_session: true }));
    } else {
      onCompleteRef.current(finalRef.current);
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
        <div className={`w-16 h-16 rounded-full flex items-center justify-center ${isConnected ? "bg-red-500 animate-pulse" : "bg-gray-300"}`}>
          <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm-1 16.93V20H9v2h6v-2h-2v-2.07A8.001 8.001 0 0 0 20 11h-2a6 6 0 0 1-12 0H4a8.001 8.001 0 0 0 7 7.93z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-gray-700">{isConnected ? "Listening..." : "Connecting..."}</p>
        <p className="text-xs text-gray-400">{formatTime(elapsedSeconds)}</p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
        <div className="px-4 py-2 border-b border-gray-200">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Live Transcript</span>
        </div>
        <div className="h-48 overflow-y-auto px-4 py-3">
          {finalTranscript || partialText ? (
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
              {finalTranscript}
              {partialText && (
                <span className="text-gray-400">{finalTranscript ? " " : ""}{partialText}</span>
              )}
            </p>
          ) : (
            <p className="text-sm text-gray-400 italic">Waiting for speech...</p>
          )}
          <div ref={transcriptEndRef} />
        </div>
      </div>

      <p className="text-xs text-gray-400 text-center">When everyone has finished ordering, tap Done.</p>

      <button
        onClick={handleDone}
        disabled={isFlushing || !isConnected}
        className="w-full rounded-lg bg-gray-900 px-6 py-4 text-lg font-semibold text-white hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isFlushing ? "Processing..." : "Done"}
      </button>
    </div>
  );
}
