"use client";

import { ConfidenceBadge } from "./confidence-badge";
import { formatDistance, formatWalkTime } from "@/lib/geo";
import { KIND_LABELS, type Restroom } from "@/lib/types";

/**
 * Nearest-first list. Some people would rather scan text than hunt for pins,
 * and it's the only usable view when a location fix is inaccurate.
 */
export function RestroomList({
  restrooms,
  onSelect,
  loading,
}: {
  restrooms: Restroom[];
  onSelect: (restroom: Restroom) => void;
  loading: boolean;
}) {
  if (loading && restrooms.length === 0) {
    return (
      <div className="px-5 py-16 text-center text-sm text-muted">
        Looking for restrooms nearby…
      </div>
    );
  }

  if (restrooms.length === 0) {
    return (
      <div className="px-8 py-16 text-center">
        <p className="text-base font-medium">Nothing here yet</p>
        <p className="mt-1 text-sm text-muted">
          No restrooms in this area. If you know one, add it — you&apos;ll be the
          first.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-line">
      {restrooms.map((restroom) => {
        const distance = formatDistance(restroom.distanceM);
        const walk = formatWalkTime(restroom.distanceM);
        return (
          <li key={restroom.id}>
            <button
              type="button"
              onClick={() => onSelect(restroom)}
              className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition active:bg-mist"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{restroom.name}</span>
                  {restroom.confidence !== "confirmed" && (
                    <ConfidenceBadge confidence={restroom.confidence} />
                  )}
                </div>
                <p className="mt-0.5 truncate text-sm text-muted">
                  {KIND_LABELS[restroom.kind]}
                  {restroom.isFree ? " · Free" : " · Paid"}
                  {restroom.requiresPurchase && " · Purchase required"}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm font-semibold">{distance}</div>
                {walk && <div className="text-xs text-muted">{walk}</div>}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
