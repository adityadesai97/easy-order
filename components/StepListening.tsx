"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface Props {
  onComplete: (transcript: string) => void;
}

type RecordingError =
  | "NOT_SUPPORTED"
  | "MIC_DENIED"
  | "MIC_NOT_FOUND"
  | "MIC_IN_USE"
  | "UNKNOWN";

const ERROR_MESSAGES: Record<RecordingError, string> = {
  NOT_SUPPORTED: "Audio recording is not supported in this browser. Please use Chrome or Firefox.",
  MIC_DENIED: "Microphone access was denied. Please allow microphone access and try again.",
  MIC_NOT_FOUND: "No microphone found. Please connect a microphone and try again.",
  MIC_IN_USE: "Microphone is in use by another app. Please close other apps using the mic.",
  UNKNOWN: "An unexpected error occurred. Please try again.",
};

function getMimeType(): string {
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  for (const t of types) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) {
      return t;
    }
  }
  return "audio/webm";
}

export default function StepListening({ onComplete }: Props) {
  const [transcript, setTranscript] = useState("");
  const [chunkCount, setChunkCount] = useState(0);
  const [isFlushing, setIsFlushing] = useState(false);
  const [error, setError] = useState<RecordingError | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const transcriptRef = useRef("");
  const pendingUploads = useRef<Promise<void>[]>([]);
  const chunkIndex = useRef(0);
  const completedChunks = useRef<Record<number, string>>({});
  const nextFlushIndex = useRef(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const flushCompletedChunks = useCallback(() => {
    while (completedChunks.current[nextFlushIndex.current] !== undefined) {
      const text = completedChunks.current[nextFlushIndex.current];
      if (text) {
        transcriptRef.current = transcriptRef.current
          ? transcriptRef.current + " " + text
          : text;
        setTranscript(transcriptRef.current);
      }
      delete completedChunks.current[nextFlushIndex.current];
      nextFlushIndex.current++;
    }
  }, []);

  const uploadChunk = useCallback(
    (blob: Blob, index: number) => {
      const upload = async () => {
        try {
          const formData = new FormData();
          formData.append("audio", blob);
          const res = await fetch("/api/transcribe", {
            method: "POST",
            body: formData,
          });
          if (res.ok) {
            const data = (await res.json()) as { text?: string };
            completedChunks.current[index] = data.text ?? "";
          } else {
            completedChunks.current[index] = "";
          }
        } catch {
          completedChunks.current[index] = "";
        }
        setChunkCount((n) => n + 1);
        flushCompletedChunks();
      };
      return upload();
    },
    [flushCompletedChunks]
  );

  useEffect(() => {
    if (typeof MediaRecorder === "undefined") {
      setError("NOT_SUPPORTED");
      return;
    }

    let cancelled = false;

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        const mimeType = getMimeType();
        const recorder = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data.size === 0) return;
          const idx = chunkIndex.current++;
          const p = uploadChunk(e.data, idx);
          pendingUploads.current.push(p);
        };

        recorder.start(30000);

        timerRef.current = setInterval(() => {
          setElapsedSeconds((s) => s + 1);
        }, 1000);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof DOMException) {
          if (err.name === "NotAllowedError") setError("MIC_DENIED");
          else if (err.name === "NotFoundError") setError("MIC_NOT_FOUND");
          else if (err.name === "NotReadableError") setError("MIC_IN_USE");
          else setError("UNKNOWN");
        } else {
          setError("UNKNOWN");
        }
      }
    };

    start();

    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        mediaRecorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [uploadChunk]);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  const handleDone = async () => {
    if (!mediaRecorderRef.current) return;
    setIsFlushing(true);
    if (timerRef.current) clearInterval(timerRef.current);

    await new Promise<void>((resolve) => {
      const recorder = mediaRecorderRef.current!;
      recorder.onstop = () => resolve();
      recorder.requestData();
      recorder.stop();
    });

    streamRef.current?.getTracks().forEach((t) => t.stop());
    await Promise.all(pendingUploads.current);

    onComplete(transcriptRef.current);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  if (error) {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center text-2xl">
          !
        </div>
        <p className="text-gray-700 max-w-xs">{ERROR_MESSAGES[error]}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 w-full max-w-md mx-auto">
      {/* Mic indicator */}
      <div className="flex flex-col items-center gap-2">
        <div className="relative">
          <div className="w-16 h-16 rounded-full bg-red-500 animate-pulse flex items-center justify-center">
            <svg
              className="w-7 h-7 text-white"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm-1 16.93V20H9v2h6v-2h-2v-2.07A8.001 8.001 0 0 0 20 11h-2a6 6 0 0 1-12 0H4a8.001 8.001 0 0 0 7 7.93z" />
            </svg>
          </div>
        </div>
        <p className="text-sm font-medium text-gray-700">Listening...</p>
        <p className="text-xs text-gray-400">{formatTime(elapsedSeconds)}</p>
      </div>

      {/* Live transcript */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Live Transcript
          </span>
          <span className="text-xs text-gray-400">
            {chunkCount} segment{chunkCount !== 1 ? "s" : ""} processed
          </span>
        </div>
        <div className="h-48 overflow-y-auto px-4 py-3">
          {transcript ? (
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
              {transcript}
            </p>
          ) : (
            <p className="text-sm text-gray-400 italic">
              Waiting for speech...
            </p>
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
