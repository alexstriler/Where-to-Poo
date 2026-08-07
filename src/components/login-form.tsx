"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";

/**
 * One button. Finding a restroom never requires an account — signing in is only
 * for adding and voting, so this screen only ever appears at that moment.
 */
export function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
  const callbackError = params.get("error");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    callbackError ? "That sign-in didn't complete. Please try again." : null,
  );

  async function signIn() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("Sign-in needs a Supabase project. See the README for setup.");
      return;
    }

    setBusy(true);
    setError(null);

    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });

    if (authError) {
      setError(authError.message);
      setBusy(false);
    }
    // On success the browser navigates to Google; nothing more to do here.
  }

  return (
    <main className="pad-safe-bottom pad-safe-top grid min-h-[100dvh] place-items-center bg-mist px-6">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl bg-paper p-7 text-center shadow-sm ring-1 ring-line">
          <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-brand-soft text-3xl">
            🚻
          </div>
          <h1 className="text-xl font-semibold">Sign in to contribute</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Finding restrooms is always free and needs no account. Signing in
            just keeps the crowdsourced data trustworthy.
          </p>

          {!isSupabaseConfigured && (
            <p className="mt-5 rounded-lg bg-mist px-3 py-2 text-xs text-muted">
              Supabase isn&apos;t connected yet, so sign-in is disabled. The
              README walks through it.
            </p>
          )}

          <button
            type="button"
            onClick={() => void signIn()}
            disabled={busy || !isSupabaseConfigured}
            className="mt-6 flex w-full items-center justify-center gap-3 rounded-xl border border-line bg-paper px-4 py-3.5 text-base font-semibold transition active:bg-mist disabled:opacity-50"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path fill="#4285F4" d="M17.6 9.2c0-.6-.1-1.3-.2-1.9H9v3.5h4.8a4.1 4.1 0 0 1-1.8 2.7v2.3h3c1.7-1.6 2.7-4 2.7-6.6z" />
              <path fill="#34A853" d="M9 18c2.4 0 4.5-.8 6-2.2l-3-2.3c-.8.6-1.9.9-3 .9-2.3 0-4.3-1.6-5-3.7H1v2.4A9 9 0 0 0 9 18z" />
              <path fill="#FBBC05" d="M4 10.7a5.4 5.4 0 0 1 0-3.4V4.9H1a9 9 0 0 0 0 8.2l3-2.4z" />
              <path fill="#EA4335" d="M9 3.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 1 4.9l3 2.4C4.7 5.2 6.7 3.6 9 3.6z" />
            </svg>
            {busy ? "Opening Google…" : "Continue with Google"}
          </button>

          {error && <p className="mt-4 text-sm text-danger">{error}</p>}
        </div>

        <Link
          href="/"
          className="mt-5 block text-center text-sm font-medium text-muted underline underline-offset-4"
        >
          Back to the map
        </Link>
      </div>
    </main>
  );
}
