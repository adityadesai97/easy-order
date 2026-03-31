"use client";

import type { Session } from "@/lib/types";

interface Props {
  peopleCount: number;
  onChange: (n: number) => void;
  onStart: () => void;
  sessions: Session[];
  onSelectSession: (session: Session) => void;
  onDeleteSession: (id: string) => void;
}

const statusLabel: Record<string, string> = {
  adequate: "Just Right",
  light: "Light",
  generous: "A Lot",
};

const statusStyle: Record<string, string> = {
  adequate: "bg-green-100 text-green-800",
  light: "bg-yellow-100 text-yellow-800",
  generous: "bg-red-100 text-red-800",
};

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function StepInput({
  peopleCount,
  onChange,
  onStart,
  sessions,
  onSelectSession,
  onDeleteSession,
}: Props) {
  return (
    <div className="flex flex-col items-center gap-8 w-full">
      <div className="w-full max-w-xs flex flex-col gap-4">
        <div>
          <label
            htmlFor="people"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            How many people are dining?
          </label>
          <input
            id="people"
            type="number"
            min={1}
            max={20}
            value={peopleCount}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val) && val >= 1 && val <= 20) onChange(val);
            }}
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-lg text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <button
          onClick={onStart}
          className="w-full rounded-lg bg-indigo-600 px-6 py-4 text-lg font-semibold text-white hover:bg-indigo-700 active:bg-indigo-800 transition-colors"
        >
          Start Listening
        </button>
      </div>

      <p className="text-xs text-gray-400 text-center max-w-xs">
        Place your phone in the center of the table. The app will listen to the
        conversation and extract your order when you&apos;re done.
      </p>

      {sessions.length > 0 && (
        <div className="w-full max-w-xs flex flex-col gap-3">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Recent Sessions
          </h2>
          <div className="flex flex-col gap-2">
            {sessions.map((session) => (
              <div
                key={session.id}
                onClick={() => onSelectSession(session)}
                className="rounded-xl border border-gray-200 bg-white p-3 cursor-pointer hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-500">
                    {formatDate(session.updatedAt)} &middot; {session.peopleCount}{" "}
                    {session.peopleCount === 1 ? "person" : "people"}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    {session.result.orders.length === 0 ? (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        No orders
                      </span>
                    ) : (
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          statusStyle[session.result.analysis.status] ??
                          statusStyle.adequate
                        }`}
                      >
                        {statusLabel[session.result.analysis.status] ?? "—"}
                      </span>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSession(session.id);
                      }}
                      className="text-gray-300 hover:text-gray-500 transition-colors text-lg leading-none"
                      aria-label="Delete session"
                    >
                      ×
                    </button>
                  </div>
                </div>
                {session.result.orders.length > 0 && (
                  <p className="mt-1 text-sm text-gray-600 truncate">
                    {session.result.orders
                      .slice(0, 3)
                      .map((o) => o.item)
                      .join(", ")}
                    {session.result.orders.length > 3 ? "…" : ""}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
