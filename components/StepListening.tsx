"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const SAMPLE_RATE = 16000;
const TOKEN_REFRESH_MS = 8 * 60 * 1000;

interface Props {
  onComplete: (transcript: string) => void;
}

interface RealtimeTokenResponse {
  token: string;
  expiresAt: number;
  error?: string;
}

interface AssemblyAITurnMessage {
  type?: string;
  transcript?: string;
  turn_is_formatted?: boolean;
  end_of_turn?: boolean;
}

export default function StepListening({ onComplete }: Props) {
  const [transcript, setTranscript] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFlushing, setIsFlushing] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const transcriptRef = useRef("");
  const partialRef = useRef("");
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const onCompleteRef = useRef(onComplete);
  const finishedRef = useRef(false);

  const wsRef = useRef<WebSocket | null>(null);
  const tokenRef = useRef<string | null>(null);
  const tokenExpiresAtRef = useRef<number>(0);
  const tokenRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onCompleteCalledRef = useRef(false);

  onCompleteRef.current = onComplete;

  const completeOnce = useCallback(() => {
    if (onCompleteCalledRef.current) return;
    onCompleteCalledRef.current = true;
    onCompleteRef.current(transcriptRef.current.trim());
  }, []);

  const appendFinalText = useCallback((text: string) => {
    const clean = text.trim();
    if (!clean) return;
    transcriptRef.current = transcriptRef.current
      ? `${transcriptRef.current} ${clean}`
      : clean;
    const rendered = partialRef.current
      ? `${transcriptRef.current}\n${partialRef.current}`
      : transcriptRef.current;
    setTranscript(rendered);
  }, []);

  const renderPartial = useCallback((partial: string) => {
    partialRef.current = partial.trim();
    const rendered = partialRef.current
      ? `${transcriptRef.current}\n${partialRef.current}`
      : transcriptRef.current;
    setTranscript(rendered);
  }, []);

  const cleanupAudio = useCallback(() => {
    if (processorNodeRef.current) {
      processorNodeRef.current.disconnect();
      processorNodeRef.current.onaudioprocess = null;
      processorNodeRef.current = null;
    }
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    setIsRecording(false);
  }, []);

  const clearTimers = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (tokenRefreshTimerRef.current) {
      clearTimeout(tokenRefreshTimerRef.current);
      tokenRefreshTimerRef.current = null;
    }
  }, []);

  const mintRealtimeToken = useCallback(async () => {
    const response = await fetch("/api/realtime-token", { method: "GET" });
    const data = (await response.json()) as RealtimeTokenResponse;
    if (!response.ok || !data.token) {
      throw new Error(data.error || "Failed to mint realtime token.");
    }
    tokenRef.current = data.token;
    tokenExpiresAtRef.current = data.expiresAt || Date.now() + 10 * 60 * 1000;
    return data.token;
  }, []);

  const scheduleTokenRefresh = useCallback(() => {
    if (tokenRefreshTimerRef.current) clearTimeout(tokenRefreshTimerRef.current);
    tokenRefreshTimerRef.current = setTimeout(async () => {
      if (finishedRef.current) return;
      try {
        await mintRealtimeToken();
      } catch {
        // keep current socket running; reconnect path will retry minting
      }
      scheduleTokenRefresh();
    }, TOKEN_REFRESH_MS);
  }, [mintRealtimeToken]);

  const connectSocket = useCallback(async (token: string) => {
    const ws = new WebSocket(
      `wss://streaming.assemblyai.com/v3/ws?sample_rate=${SAMPLE_RATE}&token=${encodeURIComponent(token)}`
    );
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(String(event.data)) as AssemblyAITurnMessage;
        if (data.type === "Turn") {
          if (data.turn_is_formatted || data.end_of_turn) {
            appendFinalText(data.transcript || "");
            renderPartial("");
          } else {
            renderPartial(data.transcript || "");
          }
        }
        if (data.type === "Termination" && finishedRef.current) {
          completeOnce();
        }
      } catch {
        // ignore malformed messages
      }
    };

    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error("WebSocket open failed"));
    });

    ws.onerror = () => {
      if (!finishedRef.current) {
        setError("Realtime transcription connection failed. Please try again.");
        cleanupAudio();
        clearTimers();
      }
    };

    ws.onclose = () => {
      if (finishedRef.current) {
        completeOnce();
      } else {
        setError("Transcription connection closed unexpectedly. Please try again.");
        cleanupAudio();
        clearTimers();
      }
    };
  }, [appendFinalText, clearTimers, cleanupAudio, completeOnce, renderPartial]);

  const startAudioPipeline = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    mediaStreamRef.current = stream;

    const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
    audioContextRef.current = audioContext;

    const source = audioContext.createMediaStreamSource(stream);
    sourceNodeRef.current = source;

    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    processorNodeRef.current = processor;

    processor.onaudioprocess = (event) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN || finishedRef.current) return;

      const input = event.inputBuffer.getChannelData(0);
      const pcm16 = new Int16Array(input.length);
      for (let i = 0; i < input.length; i += 1) {
        const sample = Math.max(-1, Math.min(1, input[i]));
        pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      }
      ws.send(pcm16.buffer);
    };

    source.connect(processor);
    processor.connect(audioContext.destination);

    setIsRecording(true);
    timerRef.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
  }, []);

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Microphone not supported in this browser.");
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const token = await mintRealtimeToken();
        if (cancelled) return;
        scheduleTokenRefresh();
        await connectSocket(token);
        if (cancelled) return;
        await startAudioPipeline();
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Could not start realtime transcription.";
        setError(message);
        cleanupAudio();
        clearTimers();
      }
    })();

    return () => {
      cancelled = true;
      finishedRef.current = true;
      clearTimers();
      cleanupAudio();
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [clearTimers, cleanupAudio, connectSocket, mintRealtimeToken, scheduleTokenRefresh, startAudioPipeline]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  const handleDone = () => {
    finishedRef.current = true;
    setIsFlushing(true);
    clearTimers();
    cleanupAudio();

    const ws = wsRef.current;
    if (!ws) {
      completeOnce();
      return;
    }

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "Terminate" }));
      setTimeout(() => {
        ws.close();
        completeOnce();
      }, 3000);
      return;
    }

    completeOnce();
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
        <div className={`w-16 h-16 rounded-full flex items-center justify-center ${isRecording ? "bg-red-500 animate-pulse" : "bg-gray-300"}`}>
          <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm-1 16.93V20H9v2h6v-2h-2v-2.07A8.001 8.001 0 0 0 20 11h-2a6 6 0 0 1-12 0H4a8.001 8.001 0 0 0 7 7.93z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-gray-700">{isRecording ? "Listening..." : "Starting..."}</p>
        <p className="text-xs text-gray-400">{formatTime(elapsedSeconds)}</p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
        <div className="px-4 py-2 border-b border-gray-200">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Live Transcript</span>
        </div>
        <div className="h-48 overflow-y-auto px-4 py-3">
          {transcript ? (
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{transcript}</p>
          ) : (
            <p className="text-sm text-gray-400 italic">Waiting for speech...</p>
          )}
          <div ref={transcriptEndRef} />
        </div>
      </div>

      <p className="text-xs text-gray-400 text-center">When everyone has finished ordering, tap Done.</p>

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
