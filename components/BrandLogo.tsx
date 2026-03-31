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
      <rect x="16" y="22" width="20" height="26" rx="6" fill="#E5E7EB" />
      <rect x="28" y="16" width="20" height="26" rx="6" fill="#FFFFFF" />
      <ellipse cx="38" cy="25.5" rx="3.75" ry="4.75" fill="#4338CA" />
      <rect x="36.75" y="29" width="2.5" height="11" rx="1.25" fill="#4338CA" />
      <rect x="18.5" y="33" width="6.5" height="1.75" rx="0.875" fill="#9CA3AF" />
      <rect x="18.5" y="37" width="5" height="1.75" rx="0.875" fill="#9CA3AF" />
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
        </div>
      ) : null}
    </div>
  );
}
