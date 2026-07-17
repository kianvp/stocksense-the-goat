import { ImageResponse } from "next/og";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";

// Rendered once at build time into a static PNG (the app is `output: "export"`,
// so nothing runs per-request). This is what WhatsApp/X/Slack show when someone
// shares the link.

// Required for `output: "export"` — see the note in robots.ts.
export const dynamic = "force-static";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(135deg, #041a11 0%, #0c4a30 55%, #115e3c 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        {/* Wordmark */}
        <div style={{ display: "flex", alignItems: "center", fontSize: 40, fontWeight: 600 }}>
          <div
            style={{
              display: "flex",
              width: 52,
              height: 52,
              marginRight: 18,
              borderRadius: 14,
              background: "#ecf6f0",
              alignItems: "center",
              justifyContent: "center",
              color: "#115e3c",
              fontSize: 30,
              fontWeight: 700,
            }}
          >
            ↗
          </div>
          <div style={{ display: "flex" }}>
            <span>Invest</span>
            <span style={{ color: "#6fb98e" }}>Sense</span>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 48,
            fontSize: 78,
            fontWeight: 700,
            letterSpacing: "-0.035em",
            lineHeight: 1.05,
          }}
        >
          Ask the market anything.
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 30,
            color: "rgba(255,255,255,0.72)",
            letterSpacing: "-0.01em",
          }}
        >
          2,350+ NSE stocks · 325+ ETFs · live data · AI research
        </div>
      </div>
    ),
    size,
  );
}
