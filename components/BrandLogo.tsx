interface BrandLogoProps {
  className?: string;
  showWordmark?: boolean;
}

function classes(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={classes("h-12 w-12", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="64" height="64" rx="15" fill="#111827" />
      <rect x="13.5" y="26" width="23" height="30" rx="7" fill="#E5E7EB" />
      <rect x="26.5" y="18" width="23" height="30" rx="7" fill="#FFFFFF" />
      <ellipse cx="38" cy="28" rx="4" ry="5" fill="#4338CA" />
      <rect x="36.75" y="31.5" width="2.5" height="10" rx="1.25" fill="#4338CA" />
      <rect x="17" y="36.5" width="11.5" height="2" rx="1" fill="#9CA3AF" />
      <rect x="17" y="41" width="8.5" height="2" rx="1" fill="#9CA3AF" />
    </svg>
  );
}

export default function BrandLogo({
  className,
  showWordmark = true,
}: BrandLogoProps) {
  return (
    <div className={classes("inline-flex items-center gap-3", className)}>
      <BrandMark className="h-14 w-14" />
      {showWordmark ? (
        <div className="text-left">
          <div className="text-2xl font-bold tracking-tight text-gray-900">
            Easy Order
          </div>
          <div className="text-sm text-gray-500">Listen once. Order clearly.</div>
        </div>
      ) : null}
    </div>
  );
}
