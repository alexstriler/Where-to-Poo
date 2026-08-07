"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ConfidenceBadge } from "./confidence-badge";
import { fetchMySubmissions } from "@/lib/queries";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { KIND_LABELS, type Restroom } from "@/lib/types";

/** Everything this user has contributed, and how the community has rated it. */
export function MySubmissions() {
  const [restrooms, setRestrooms] = useState<Restroom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMySubmissions()
      .then(setRestrooms)
      .catch((cause: unknown) =>
        setError(
          cause instanceof Error ? cause.message : "Couldn't load your list.",
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="pad-safe-top pad-safe-bottom min-h-[100dvh] bg-mist md:hidden">
      <div className="px-5 pb-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted"
        >
          ‹ Back to the map
        </Link>
        <h1 className="mt-3 text-xl font-semibold">Your restrooms</h1>
        <p className="mt-1 text-sm text-muted">
          Places you&apos;ve added, and how travellers have rated them since.
        </p>
      </div>

      {!isSupabaseConfigured ? (
        <Empty>
          Connect Supabase to start contributing. The README walks through it.
        </Empty>
      ) : loading ? (
        <Empty>Loading…</Empty>
      ) : error ? (
        <Empty>{error}</Empty>
      ) : restrooms.length === 0 ? (
        <Empty>
          You haven&apos;t added any yet. Every entry makes the map more useful
          for the next traveller.
        </Empty>
      ) : (
        <ul className="divide-y divide-line border-y border-line bg-paper">
          {restrooms.map((restroom) => (
            <li key={restroom.id} className="px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{restroom.name}</p>
                  <p className="mt-0.5 text-sm text-muted">
                    {KIND_LABELS[restroom.kind]}
                  </p>
                </div>
                <ConfidenceBadge confidence={restroom.confidence} />
              </div>
              <p className="mt-2 text-xs text-muted">
                {restroom.up} confirmed · {restroom.down} reported gone
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-8 py-16 text-center text-sm text-muted">{children}</div>
  );
}
