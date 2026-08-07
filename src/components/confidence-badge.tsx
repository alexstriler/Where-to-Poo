import type { Confidence } from "@/lib/types";

const LABELS: Record<Confidence, string> = {
  confirmed: "Confirmed",
  unverified: "Unverified",
  likely_gone: "Reported gone",
};

const STYLES: Record<Confidence, string> = {
  confirmed: "bg-green-50 text-green-700 ring-green-600/20",
  unverified: "bg-amber-50 text-amber-700 ring-amber-600/20",
  likely_gone: "bg-gray-100 text-gray-600 ring-gray-500/20",
};

/** The one place confidence turns into words, so map, list, and sheet agree. */
export function ConfidenceBadge({
  confidence,
  className = "",
}: {
  confidence: Confidence;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STYLES[confidence]} ${className}`}
    >
      {LABELS[confidence]}
    </span>
  );
}

/** Small neutral chip for facts like "Free" or "Step-free access". */
export function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-mist px-2.5 py-1 text-xs font-medium text-ink ring-1 ring-line ring-inset">
      {children}
    </span>
  );
}
