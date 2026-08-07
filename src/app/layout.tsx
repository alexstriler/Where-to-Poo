import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Where To Poo — find a public restroom nearby",
  description:
    "Crowdsourced public restrooms for travellers. Find a free restroom near you, and add the ones you know about.",
  manifest: "/manifest.webmanifest",
  applicationName: "Where To Poo",
  appleWebApp: {
    capable: true,
    title: "Where To Poo",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The map handles its own zoom; letting the page zoom breaks the layout.
  maximumScale: 1,
  userScalable: false,
  // Lets the page paint under the notch so .pad-safe-* can do its job.
  viewportFit: "cover",
  themeColor: "#0d9488",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
