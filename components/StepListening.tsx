"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const CHUNK_INTERVAL_MS = 5000;

interface Props {
  onComplete: (transcript: string) => void;
}

export default function StepListening({ onComplete }: Props) {
  const [transcript, setTranscript] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFlushing, setIsFlushing] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const transcriptRef = useRef("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const stoppedRef = useRef(false);
  const pendingRef = useRef(0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const appendText = useCallback((text: string) => {
    if (!text.trim()) return;
    transcriptRef.current = transcriptRef.current
      ? transcriptRef.current + " " + text.trim()
      : text.trim();
    setTranscript(transcriptRef.current);
  }, []);

  const uploadChunk = useCallback(async (blob: Blob) => {
    if (!blob.size) return;
    pendingRef.current += 1;
    try {
      const body = new FormData();
      body.append("audio", blob);
      const res = await fetch("/api/transcribe", { method: "POST", body });
      if (res.ok) {
        const data = (await res.json()) as { text?: string };
        if (data.text) appendText(data.text);
      }
    } catch {
      // Non-fatal — chunk lost, continue
    } finally {
      pendingRef.current -= 1;
      if (stoppedRef.current && pendingRef.current === 0) {
        onCompleteRef.current(transcriptRef.current);
      }
    }
  }, [appendText]);

  const startNewChunk = useCallback((recorder: MediaRecorder) => {
    if (stoppedRef.current) return;
    recorder.stop();
    recorder.start();
  }, []);

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Microphone not supported in this browser.");
      return;
    }

    let recorder: MediaRecorder;

    navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then((stream) => {
      const mimeType =
        MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm"
        : "audio/mp4";

      recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) uploadChunk(e.data);
      };

      recorder.start();
      setIsRecording(true);

      timerRef.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
      chunkTimerRef.current = setInterval(() => startNewChunk(recorder), CHUNK_INTERVAL_MS);
    }).catch((e: unknown) => {
      const name = (e as { name?: string }).name;
      setError(
        name === "NotAllowedError"
          ? "Microphone access was denied. Please allow microphone access and try again."
          : "Could not access microphone. Please check your device settings."
      );
    });

    return () => {
      stoppedRef.current = true;
      if (timerRef.current) clearInterval(timerRef.current);
      if (chunkTimerRef.current) clearInterval(chunkTimerRef.current);
      recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, [uploadChunk, startNewChunk]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  const handleDone = () => {
    stoppedRef.current = true;
    setIsFlushing(true);
    if (timerRef.current) clearInterval(timerRef.current);
    if (chunkTimerRef.current) clearInterval(chunkTimerRef.current);

    const recorder = recorderRef.current;
    if (!recorder) { onCompleteRef.current(transcriptRef.current); return; }

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        pendingRef.current += 1;
        uploadChunk(e.data).then(() => {
          pendingRef.current -= 1;
          if (pendingRef.current === 0) onCompleteRef.current(transcriptRef.current);
        });
      } else if (pendingRef.current === 0) {
        onCompleteRef.current(transcriptRef.current);
      }
    };

    recorder.stop();
    recorder.stream.getTracks().forEach((t) => t.stop());
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
