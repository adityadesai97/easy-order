"use client";

interface Props {
  peopleCount: number;
  onChange: (n: number) => void;
  onStart: () => void;
}

export default function StepInput({ peopleCount, onChange, onStart }: Props) {
  return (
    <div className="flex flex-col items-center gap-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900">Easy Order</h1>
        <p className="mt-2 text-gray-500">
          Let the table talk. We&apos;ll figure out the order.
        </p>
      </div>

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
    </div>
  );
}
