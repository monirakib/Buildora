"use client";

import { useEffect } from "react";

/**
 * The last line of defence: this replaces the ROOT layout, so it only fires
 * when the layout itself throws. Everything the app normally provides — fonts,
 * globals.css, the theme script, the navbar — is gone by the time this renders,
 * which is why the markup below carries its own <html>/<body> and inline styles
 * rather than importing anything that could be the thing that failed.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[buildora] fatal error", error.digest ?? "", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#060a15",
          color: "#f1f5f9",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
          padding: 24,
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 460 }}>
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 20V8.5L12 3l8 5.5V20"
              stroke="#fbbf24"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: "24px 0 8px" }}>
            Buildora couldn&apos;t start.
          </h1>
          <p style={{ color: "#94a3b8", lineHeight: 1.6, margin: 0 }}>
            Something failed before the page could load. Reloading usually clears it.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 28,
              background: "#fbbf24",
              color: "#0c0a09",
              border: 0,
              borderRadius: 12,
              padding: "12px 22px",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
          {error.digest ? (
            <p style={{ marginTop: 20, fontSize: 12, color: "#475569", fontFamily: "monospace" }}>
              Reference {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
