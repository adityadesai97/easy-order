"use client";

import { useState } from "react";
import StepInput from "@/components/StepInput";
import StepListening from "@/components/StepListening";
import StepResults from "@/components/StepResults";
import type { OrderResult } from "@/lib/types";

type Step = "input" | "listening" | "analyzing" | "results";

export default function Home() {
  const [step, setStep] = useState<Step>("input");
  const [peopleCount, setPeopleCount] = useState(2);
  const [orderResult, setOrderResult] = useState<OrderResult | null>(null);
  const [analyzeError, setAnalyzeError] = useState("");
  const [accumulatedTranscript, setAccumulatedTranscript] = useState("");

  const handleStart = () => setStep("listening");

  const handleContinue = () => setStep("listening");

  const handleListeningComplete = async (newTranscript: string) => {
    const transcript = accumulatedTranscript
      ? accumulatedTranscript + " " + newTranscript
      : newTranscript;
    setAccumulatedTranscript(transcript);
    setStep("analyzing");
    setAnalyzeError("");
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, peopleCount }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || "Analyze failed");
      }
      const data = (await res.json()) as OrderResult;
      setOrderResult(data);
      setStep("results");
    } catch (err) {
      setAnalyzeError(
        err instanceof Error ? err.message : "Something went wrong analyzing your order."
      );
    }
  };

  const handleReset = () => {
    setStep("input");
    setOrderResult(null);
    setAnalyzeError("");
    setAccumulatedTranscript("");
  };

  return (
    <>
      {step === "input" && (
        <StepInput
          peopleCount={peopleCount}
          onChange={setPeopleCount}
          onStart={handleStart}
        />
      )}

      {step === "listening" && (
        <StepListening onComplete={handleListeningComplete} />
      )}

      {step === "analyzing" && (
        <div className="flex flex-col items-center gap-4 text-center">
          {analyzeError ? (
            <>
              <p className="text-gray-700 max-w-sm">{analyzeError}</p>
              <button
                onClick={handleReset}
                className="rounded-lg border border-gray-300 px-6 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Try Again
              </button>
            </>
          ) : (
            <>
              <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-gray-600 font-medium">Analyzing your order...</p>
            </>
          )}
        </div>
      )}

      {step === "results" && orderResult && (
        <StepResults
          result={orderResult}
          peopleCount={peopleCount}
          onContinue={handleContinue}
          onReset={handleReset}
        />
      )}
    </>
  );
}
