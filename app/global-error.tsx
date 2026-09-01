"use client";

import * as React from "react";

/**
 * Last-resort boundary for errors thrown by the root layout itself.
 * It replaces the whole document, so it must render its own <html>/<body>
 * and cannot rely on the app's providers or Tailwind layers.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("[guardai] unhandled root error", error);
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
          background: "#0b0f18",
          color: "#e8ecf1",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
        }}
      >
        <div style={{ maxWidth: "28rem", padding: "2rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", marginBottom: "0.75rem" }}>
            GuardAI could not start
          </h1>
          <p
            style={{
              fontSize: "0.875rem",
              lineHeight: 1.6,
              opacity: 0.7,
              marginBottom: "1.5rem",
            }}
          >
            An error occurred before the application could render. Reload to try
            again.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              padding: "0.625rem 1.25rem",
              borderRadius: "0.75rem",
              border: "1px solid rgba(255,255,255,0.15)",
              background: "rgba(255,255,255,0.06)",
              color: "inherit",
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
