/**
 * This is deliberately a phone app. On a wide screen we say so rather than
 * stretching a one-handed layout across 1400px and calling it responsive.
 *
 * Rendered alongside the app and toggled with a CSS breakpoint, so there's no
 * user-agent sniffing and no hydration mismatch.
 */
export function DesktopNotice() {
  return (
    <div className="hidden min-h-screen place-items-center bg-mist p-8 md:grid">
      <div className="w-full max-w-sm rounded-2xl bg-paper p-8 text-center shadow-sm ring-1 ring-line">
        <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-brand-soft text-3xl">
          🚻
        </div>
        <h1 className="text-xl font-semibold">Where To Poo</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Built for your phone, where you actually need it. Open this page on
          your phone and add it to your home screen.
        </p>
        <p className="mt-5 rounded-lg bg-mist px-3 py-2 text-xs text-muted">
          Resize this window narrower to preview the phone layout.
        </p>
      </div>
    </div>
  );
}
