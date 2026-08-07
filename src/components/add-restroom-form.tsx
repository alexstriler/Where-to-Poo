"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DEFAULT_CENTER } from "@/lib/geo";
import { addRestroom } from "@/lib/queries";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { useGeolocation } from "@/lib/use-geolocation";
import { KIND_LABELS, RESTROOM_KINDS, type Coords, type RestroomKind } from "@/lib/types";

const RestroomMap = dynamic(() => import("./restroom-map"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-[#e9e6df]" />,
});

/** Tri-state so "I don't know" stays distinct from "no". */
type Tri = "yes" | "no" | "unknown";
const triToBool = (value: Tri): boolean | null =>
  value === "unknown" ? null : value === "yes";

export function AddRestroomForm() {
  const router = useRouter();
  const geo = useGeolocation();

  const [position, setPosition] = useState<Coords>(DEFAULT_CENTER);
  const [movedPin, setMovedPin] = useState(false);
  const [flyTarget, setFlyTarget] = useState<Coords | null>(null);
  const [flyToken, setFlyToken] = useState(0);

  const [name, setName] = useState("");
  const [kind, setKind] = useState<RestroomKind>("public");
  const [isFree, setIsFree] = useState(true);
  const [requiresPurchase, setRequiresPurchase] = useState(false);
  const [accessible, setAccessible] = useState<Tri>("unknown");
  const [changingTable, setChangingTable] = useState<Tri>("unknown");
  const [hours, setHours] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(isSupabaseConfigured);

  useEffect(() => {
    geo.locate();
    // Intentionally once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Send anyone who isn't signed in to the login screen, and bring them back.
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    void supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.replace("/login?next=/add");
      else setCheckingAuth(false);
    });
  }, [router]);

  // Drop the pin on the user's fix, unless they've already nudged it.
  useEffect(() => {
    if (geo.status === "ready" && geo.coords && !movedPin) {
      setPosition(geo.coords);
      setFlyTarget(geo.coords);
      setFlyToken((n) => n + 1);
    }
  }, [geo.status, geo.coords, movedPin]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Give it a name so people know what they're looking for.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await addRestroom({
        name: name.trim(),
        kind,
        lat: position.lat,
        lng: position.lng,
        isFree,
        requiresPurchase,
        isAccessible: triToBool(accessible),
        hasChangingTable: triToBool(changingTable),
        hours: hours.trim() || null,
        address: address.trim() || null,
        notes: notes.trim() || null,
      });
      router.push("/");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't save that.");
      setSubmitting(false);
    }
  }

  if (checkingAuth) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-mist text-sm text-muted">
        Checking your account…
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-mist md:hidden">
      {/* Map picker */}
      <div className="relative h-[38dvh] w-full">
        <RestroomMap
          restrooms={[]}
          selectedId={null}
          onSelect={() => undefined}
          me={geo.coords}
          accuracyM={geo.accuracyM}
          flyTarget={flyTarget}
          flyToken={flyToken}
          onViewportChange={() => undefined}
          initialCenter={position}
          pickerMode
          pickerPosition={position}
          onPickerMove={(coords) => {
            setPosition(coords);
            setMovedPin(true);
          }}
        />

        {/* z-1000 clears Leaflet's own panes, which sit at z-index 400-700. */}
        <div className="pad-safe-top pointer-events-none absolute inset-x-0 top-0 z-1000 px-3">
          <Link
            href="/"
            className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-paper px-4 py-2.5 text-sm font-semibold shadow-md"
          >
            ‹ Cancel
          </Link>
        </div>

        <p className="pointer-events-none absolute inset-x-0 bottom-0 z-1000 bg-linear-to-t from-black/45 to-transparent px-4 pt-8 pb-3 text-center text-xs font-medium text-white">
          Drag the pin to the exact spot
        </p>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="pad-safe-bottom space-y-5 p-5">
        <div>
          <h1 className="text-xl font-semibold">Add a restroom</h1>
          <p className="mt-1 text-sm text-muted">
            Everything except the name is optional — a rough entry still helps
            more than no entry.
          </p>
        </div>

        <Field label="Name" required>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            required
            placeholder="e.g. Bryant Park Restrooms"
            className="w-full rounded-xl border border-line bg-paper px-4 py-3 text-base outline-none focus:border-brand"
          />
        </Field>

        <Field label="Type">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as RestroomKind)}
            className="w-full appearance-none rounded-xl border border-line bg-paper px-4 py-3 text-base outline-none focus:border-brand"
          >
            {RESTROOM_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>

        <div className="space-y-3 rounded-xl bg-paper p-4 ring-1 ring-line">
          <Toggle label="Free to use" checked={isFree} onChange={setIsFree} />
          <Toggle
            label="Requires a purchase"
            checked={requiresPurchase}
            onChange={setRequiresPurchase}
          />
        </div>

        <TriField label="Step-free access" value={accessible} onChange={setAccessible} />
        <TriField label="Changing table" value={changingTable} onChange={setChangingTable} />

        <Field label="Hours">
          <input
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            maxLength={120}
            placeholder="e.g. 7am–10pm"
            className="w-full rounded-xl border border-line bg-paper px-4 py-3 text-base outline-none focus:border-brand"
          />
        </Field>

        <Field label="Address or landmark">
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            maxLength={200}
            placeholder="e.g. 476 5th Ave, ground floor"
            className="w-full rounded-xl border border-line bg-paper px-4 py-3 text-base outline-none focus:border-brand"
          />
        </Field>

        <Field label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="How to find it, whether you need a code, how clean it is…"
            className="w-full resize-none rounded-xl border border-line bg-paper px-4 py-3 text-base outline-none focus:border-brand"
          />
        </Field>

        {error && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-danger">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-brand px-4 py-4 text-base font-semibold text-white transition active:bg-brand-dark disabled:opacity-60"
        >
          {submitting ? "Adding…" : "Add restroom"}
        </button>
      </form>
    </main>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
      {children}
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4">
      <span className="text-sm font-medium">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-6 w-6 accent-[var(--color-brand)]"
      />
    </label>
  );
}

function TriField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Tri;
  onChange: (value: Tri) => void;
}) {
  const options: { value: Tri; label: string }[] = [
    { value: "yes", label: "Yes" },
    { value: "no", label: "No" },
    { value: "unknown", label: "Not sure" },
  ];

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <div className="flex gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
              value === option.value
                ? "border-brand bg-brand-soft text-brand-dark"
                : "border-line bg-paper text-ink active:bg-mist"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
