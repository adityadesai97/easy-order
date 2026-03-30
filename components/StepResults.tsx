"use client";

import type { OrderResult } from "@/lib/types";

interface Props {
  result: OrderResult;
  peopleCount: number;
  onReset: () => void;
}

const statusConfig = {
  adequate: {
    label: "Just Right",
    bg: "bg-green-100",
    text: "text-green-800",
    border: "border-green-200",
  },
  light: {
    label: "Might Be Light",
    bg: "bg-yellow-100",
    text: "text-yellow-800",
    border: "border-yellow-200",
  },
  generous: {
    label: "Ordering a Lot",
    bg: "bg-red-100",
    text: "text-red-800",
    border: "border-red-200",
  },
};

export default function StepResults({ result, peopleCount, onReset }: Props) {
  const status = statusConfig[result.analysis.status] ?? statusConfig.adequate;

  return (
    <div className="flex flex-col gap-6 w-full max-w-md mx-auto">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">Your Order</h2>
        <p className="text-sm text-gray-500 mt-1">{peopleCount} people dining</p>
      </div>

      {/* Order list */}
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
          What you&apos;re ordering
        </div>
        {result.orders.length === 0 ? (
          <p className="px-4 py-6 text-center text-gray-400 text-sm">
            No orders detected.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {result.orders.map((item, i) => (
              <li key={i} className="flex items-start justify-between px-4 py-3 gap-3">
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-gray-900">{item.item}</span>
                  {item.notes && (
                    <span className="ml-2 text-sm text-gray-400">{item.notes}</span>
                  )}
                </div>
                <span className="shrink-0 text-sm font-semibold text-gray-600">
                  x{item.quantity}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Per-person summary */}
      {result.perPersonSummary && result.orders.length > 0 && (
        <p className="text-sm text-gray-600 text-center">{result.perPersonSummary}</p>
      )}

      {/* Adequacy badge */}
      <div className={`rounded-xl border p-4 ${status.bg} ${status.border}`}>
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-sm font-semibold ${status.text}`}>
            {status.label}
          </span>
        </div>
        <p className={`text-sm ${status.text}`}>{result.analysis.comment}</p>
      </div>

      <button
        onClick={onReset}
        className="w-full rounded-lg border border-gray-300 px-6 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        Start Over
      </button>
    </div>
  );
}
