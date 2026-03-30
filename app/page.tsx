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
  const [analyzeError, setAnalyzeError] = useState(false);

  const handleStart = () => {
    setStep("listening");
  };

  const handleListeningComplete = async (transcript: string) => {
    setStep("analyzing");
    setAnalyzeError(false);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, peopleCount }),
      });
      if (!res.ok) throw new Error("analyze failed");
      const data = (await res.json()) as OrderResult;
      setOrderResult(data);
      setStep("results");
    } catch {
      setAnalyzeError(true);
      setStep("analyzing");
    }
  };

  const handleReset = () => {
    setStep("input");
    setOrderResult(null);
    setAnalyzeError(false);
  };

  if (step === "input") {
    return (
      <StepInput
        peopleCount={peopleCount}
        onChange={setPeopleCount}
        onStart={handleStart}
      />
    );
  }

  if (step === "listening") {
    return <StepListening onComplete={handleListeningComplete} />;
  }

  if (step === "analyzing") {
    if (analyzeError) {
      return (
        <div className="flex flex-col items-center gap-6 text-center">
          <p className="text-gray-700">
            Something went wrong while analyzing your order.
          </p>
          <button
            onClick={handleReset}
            className="rounded-lg border border-gray-300 px-6 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Try Again
          </button>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-600 font-medium">Analyzing your order...</p>
      </div>
    );
  }

  if (step === "results" && orderResult) {
    return (
      <StepResults
        result={orderResult}
        peopleCount={peopleCount}
        onReset={handleReset}
      />
    );
  }

  return null;
}
