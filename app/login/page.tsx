"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const trimmedPasscode = passcode.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode: trimmedPasscode }),
    });

    if (res.ok) {
      router.push("/");
    } else {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "Incorrect passcode.");
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900">Easy Order</h1>
        <p className="mt-2 text-gray-500">Group dining, simplified.</p>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-xs flex flex-col gap-4">
        <input
          type="password"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          placeholder="Enter passcode"
          autoFocus
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-center text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />

        {error && <p className="text-sm text-red-600 text-center">{error}</p>}

        <button
          type="submit"
          disabled={loading || !trimmedPasscode}
          className="w-full rounded-lg bg-indigo-600 px-6 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {loading ? "Checking..." : "Enter"}
        </button>
      </form>
    </div>
  );
}
