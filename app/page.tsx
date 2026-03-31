"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import StepInput from "@/components/StepInput";
import StepListening from "@/components/StepListening";
import StepResults from "@/components/StepResults";
import type { OrderResult } from "@/lib/types";

type Step = "input" | "listening" | "analyzing" | "results";

export default function Home() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState<Step>("input");
  const [peopleCount, setPeopleCount] = useState(2);
  const [orderResult, setOrderResult] = useState<OrderResult | null>(null);
  const [analyzeError, setAnalyzeError] = useState(false);

  // Redirect to onboarding if API keys aren't set up yet
  useEffect(() => {
    const check = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("user_settings")
        .select("groq_api_key, anthropic_api_key")
        .eq("user_id", user.id)
        .single();
      if (!data?.groq_api_key || !data?.anthropic_api_key) {
        router.replace("/onboarding");
      } else {
        setReady(true);
      }
    };
    check();
  }, [router]);

  const handleStart = () => setStep("listening");

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
    }
  };

  const handleReset = () => {
    setStep("input");
    setOrderResult(null);
    setAnalyzeError(false);
  };

  if (!ready) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      {/* Settings link */}
      <div className="absolute top-4 right-4">
        <button
          onClick={() => router.push("/settings")}
          className="text-sm text-gray-400 hover:text-gray-600"
        >
          Settings
        </button>
      </div>

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
              <p className="text-gray-700">Something went wrong analyzing your order.</p>
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
          onReset={handleReset}
        />
      )}
    </>
  );
}
