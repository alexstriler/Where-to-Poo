"use client";

import { useState } from "react";
import { Chip, ConfidenceBadge } from "./confidence-badge";
import { directionsUrl, formatDistance, formatWalkTime } from "@/lib/geo";
import { KIND_LABELS, type Restroom, type VoteValue } from "@/lib/types";

interface RestroomSheetProps {
  restroom: Restroom;
  onClose: () => void;
  onVote: (restroom: Restroom, vote: VoteValue) => Promise<void>;
}

/**
 * The bottom sheet that rises when you tap a pin. Everything a traveller needs
 * to decide "do I walk there?" without leaving the map.
 */
export function RestroomSheet({ restroom, onClose, onVote }: RestroomSheetProps) {
  const [pending, setPending] = useState<VoteValue | null>(null);
  const [voted, setVoted] = useState<VoteValue | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleVote(vote: VoteValue) {
    setPending(vote);
    setError(null);
    try {
      await onVote(restroom, vote);
      setVoted(vote);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't save that vote.");
    } finally {
      setPending(null);
    }
  }

  const distance = formatDistance(restroom.distanceM);
  const walk = formatWalkTime(restroom.distanceM);

  return (
    <div className="animate-sheet-up pad-safe-bottom absolute inset-x-0 bottom-0 z-1000 max-h-[70svh] overflow-y-auto rounded-t-[var(--radius-sheet)] bg-paper shadow-[0_-8px_30px_rgba(0,0,0,0.18)]">
      {/* Drag affordance + close. */}
      <div className="sticky top-0 flex items-start gap-3 rounded-t-[var(--radius-sheet)] bg-paper px-5 pt-3 pb-2">
        <div className="flex-1">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg leading-tight font-semibold">{restroom.name}</h2>
            <ConfidenceBadge confidence={restroom.confidence} />
          </div>
          <p className="mt-0.5 text-sm text-muted">
            {KIND_LABELS[restroom.kind]}
            {distance && ` · ${distance}`}
            {walk && ` · ${walk}`}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mr-2 shrink-0 rounded-full p-2 text-muted transition hover:bg-mist active:bg-line"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="M5 5l10 10M15 5L5 15"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      <div className="space-y-4 px-5 pb-5">
        {restroom.confidence === "likely_gone" && (
          <p className="rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-700">
            Several people reported this one is gone or permanently closed. It
            might not be worth the walk.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Chip>{restroom.isFree ? "Free" : "Paid"}</Chip>
          {restroom.requiresPurchase && <Chip>Purchase required</Chip>}
          {restroom.isAccessible === true && <Chip>Step-free access</Chip>}
          {restroom.hasChangingTable === true && <Chip>Changing table</Chip>}
          {restroom.source === "osm" && <Chip>From OpenStreetMap</Chip>}
        </div>

        {restroom.hours && (
          <p className="text-sm">
            <span className="font-medium">Hours: </span>
            <span className="text-muted">{restroom.hours}</span>
          </p>
        )}
        {restroom.address && (
          <p className="text-sm text-muted">{restroom.address}</p>
        )}
        {restroom.notes && (
          <p className="text-sm leading-relaxed">{restroom.notes}</p>
        )}

        <a
          href={directionsUrl({ lat: restroom.lat, lng: restroom.lng }, restroom.name)}
          target="_blank"
          rel="noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3.5 text-base font-semibold text-white transition active:bg-brand-dark"
        >
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="M10 18s6-5.3 6-10A6 6 0 0 0 4 8c0 4.7 6 10 6 10z"
              stroke="currentColor"
              strokeWidth="1.6"
            />
            <circle cx="10" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.6" />
          </svg>
          Directions
        </a>

        {/* Community verification — the thing that keeps the data honest. */}
        <div className="border-t border-line pt-4">
          <p className="mb-2 text-sm font-medium">Is this still here?</p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending !== null}
              onClick={() => void handleVote(1)}
              className={`flex-1 rounded-xl border px-3 py-3 text-sm font-semibold transition disabled:opacity-60 ${
                voted === 1
                  ? "border-confirmed bg-green-50 text-confirmed"
                  : "border-line bg-paper text-ink active:bg-mist"
              }`}
            >
              {pending === 1 ? "Saving…" : "Still here"}
            </button>
            <button
              type="button"
              disabled={pending !== null}
              onClick={() => void handleVote(-1)}
              className={`flex-1 rounded-xl border px-3 py-3 text-sm font-semibold transition disabled:opacity-60 ${
                voted === -1
                  ? "border-danger bg-red-50 text-danger"
                  : "border-line bg-paper text-ink active:bg-mist"
              }`}
            >
              {pending === -1 ? "Saving…" : "It's gone"}
            </button>
          </div>

          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
          {voted && !error && (
            <p className="mt-2 text-sm text-muted">
              Thanks — that helps the next traveller.
            </p>
          )}

          <p className="mt-3 text-xs text-muted">
            {restroom.up} confirmed · {restroom.down} reported gone
          </p>
        </div>
      </div>
    </div>
  );
}
