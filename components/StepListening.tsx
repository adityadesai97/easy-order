"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface Props {
  onComplete: (transcript: string) => void;
}

type RecordingError =
  | "NOT_SUPPORTED"
  | "INSECURE_CONTEXT"
  | "MIC_DENIED"
  | "MIC_NOT_FOUND"
  | "MIC_IN_USE"
  | "UNKNOWN";

const ERROR_MESSAGES: Record<RecordingError, string> = {
  NOT_SUPPORTED: "Audio recording is not supported in this browser. Please use Chrome or Firefox.",
  INSECURE_CONTEXT: "Microphone access only works on secure HTTPS pages. Please open the live site directly instead of an embedded preview.",
  MIC_DENIED: "Microphone access is blocked in your browser or site settings. Please allow microphone access for this site, then try again.",
  MIC_NOT_FOUND: "No microphone found. Please connect a microphone and try again.",
  MIC_IN_USE: "Microphone is in use by another app. Please close other apps using the mic.",
  UNKNOWN: "An unexpected error occurred. Please try again.",
};

const CHUNK_DURATION_MS = 10000;

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

function normalizeType(mimeType: string): { ext: string; type: string } {
  if (mimeType.includes("ogg")) return { ext: "ogg", type: "audio/ogg" };
  if (mimeType.includes("mp4")) return { ext: "mp4", type: "audio/mp4" };
  return { ext: "webm", type: "audio/webm" };
}

export default function StepListening({ onComplete }: Props) {
  const [transcript, setTranscript] = useState("");
  const [chunkCount, setChunkCount] = useState(0);
  const [isFlushing, setIsFlushing] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [permissionState, setPermissionState] = useState<PermissionState | null>(null);
  const [error, setError] = useState<RecordingError | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const transcriptRef = useRef("");
  const pendingUploads = useRef<Promise<void>[]>([]);
  const chunkIndex = useRef(0);
  const completedChunks = useRef<Record<number, string>>({});
  const nextFlushIndex = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const mimeTypeRef = useRef<string>("");
  const isDoneRef = useRef(false);
  const chunkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      const { ext, type } = normalizeType(blob.type || mimeTypeRef.current);
      const upload = async () => {
        try {
          const file = new File([blob], `audio.${ext}`, { type });
          const formData = new FormData();
          formData.append("audio", file, `audio.${ext}`);
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

  // Stop/start a new MediaRecorder for each chunk so every blob is a
  // complete, standalone audio file (not a stream segment).
  const startNewChunk = useCallback(() => {
    if (isDoneRef.current || !streamRef.current) return;

    const mimeType = mimeTypeRef.current;
    const recorder = new MediaRecorder(streamRef.current, { mimeType });
    const chunks: Blob[] = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      if (blob.size > 100) {
        const idx = chunkIndex.current++;
        pendingUploads.current.push(uploadChunk(blob, idx));
      }
      if (!isDoneRef.current) startNewChunk();
    };

    recorder.start();

    chunkTimerRef.current = setTimeout(() => {
      if (recorder.state === "recording") recorder.stop();
    }, CHUNK_DURATION_MS);
  }, [uploadChunk]);

  const getMicPermissionState = useCallback(async () => {
    if (!navigator.permissions?.query) return null;
    try {
      const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
      setPermissionState(status.state);
      return status.state;
    } catch {
      return null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("NOT_SUPPORTED");
      return;
    }
    if (!window.isSecureContext) {
      setError("INSECURE_CONTEXT");
      return;
    }

    setIsStarting(true);
    setError(null);

    try {
      const state = await getMicPermissionState();
      if (state === "denied") { setError("MIC_DENIED"); return; }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      mimeTypeRef.current = getMimeType();
      isDoneRef.current = false;

      setHasStarted(true);
      setElapsedSeconds(0);
      timerRef.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);

      startNewChunk();
    } catch (err) {
      if (err instanceof DOMException) {
        if (err.name === "NotAllowedError") setError("MIC_DENIED");
        else if (err.name === "NotFoundError") setError("MIC_NOT_FOUND");
        else if (err.name === "NotReadableError") setError("MIC_IN_USE");
        else setError("UNKNOWN");
      } else {
        setError("UNKNOWN");
      }
    } finally {
      setIsStarting(false);
    }
  }, [getMicPermissionState, startNewChunk]);

  useEffect(() => {
    getMicPermissionState().then((state) => {
      if (state === "granted") startRecording();
    });
  }, [getMicPermissionState, startRecording]);

  useEffect(() => {
    return () => {
      isDoneRef.current = true;
      if (timerRef.current) clearInterval(timerRef.current);
      if (chunkTimerRef.current) clearTimeout(chunkTimerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  const handleDone = async () => {
    isDoneRef.current = true;
    setIsFlushing(true);
    if (timerRef.current) clearInterval(timerRef.current);
    if (chunkTimerRef.current) clearTimeout(chunkTimerRef.current);

    // Let the current recorder finish and upload its final chunk
    await new Promise<void>((resolve) => setTimeout(resolve, 200));

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
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center text-2xl">!</div>
        <p className="text-gray-700 max-w-xs">{ERROR_MESSAGES[error]}</p>
        {error === "MIC_DENIED" && (
          <p className="text-xs text-gray-500 max-w-xs">
            If no browser prompt appeared, open your browser&apos;s site settings for this page and enable the microphone.
          </p>
        )}
        <button
          onClick={startRecording}
          disabled={isStarting}
          className="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {isStarting ? "Starting..." : "Try Again"}
        </button>
      </div>
    );
  }

  if (!hasStarted) {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
          <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm-1 16.93V20H9v2h6v-2h-2v-2.07A8.001 8.001 0 0 0 20 11h-2a6 6 0 0 1-12 0H4a8.001 8.001 0 0 0 7 7.93z" />
          </svg>
        </div>
        <div className="space-y-2">
          <p className="text-gray-800 font-medium">Ready to record the table.</p>
          <p className="text-sm text-gray-500 max-w-xs">
            {permissionState === "granted"
              ? "Your microphone is ready."
              : "Tap below to allow microphone access."}
          </p>
        </div>
        <button
          onClick={startRecording}
          disabled={isStarting}
          className="w-full max-w-xs rounded-lg bg-indigo-600 px-6 py-4 text-lg font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {isStarting ? "Starting..." : permissionState === "granted" ? "Start" : "Allow Microphone & Start"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 w-full max-w-md mx-auto">
      <div className="flex flex-col items-center gap-2">
        <div className="w-16 h-16 rounded-full bg-red-500 animate-pulse flex items-center justify-center">
          <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm-1 16.93V20H9v2h6v-2h-2v-2.07A8.001 8.001 0 0 0 20 11h-2a6 6 0 0 1-12 0H4a8.001 8.001 0 0 0 7 7.93z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-gray-700">Listening...</p>
        <p className="text-xs text-gray-400">{formatTime(elapsedSeconds)}</p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Live Transcript</span>
          <span className="text-xs text-gray-400">{chunkCount} segment{chunkCount !== 1 ? "s" : ""} processed</span>
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
