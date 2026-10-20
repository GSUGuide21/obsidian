import { ImageResponse } from "next/og";

/**
 * The app icon, drawn at `size` pixels: the sidebar's gem in the accent color
 * on the theme's navy (see app/globals.css). Full-bleed with the gem well
 * inside the middle, so it also works as a maskable icon (launchers crop to a
 * circle or squircle).
 */
export function appIcon(size: number) {
  const gem = Math.round(size * 0.52);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b1222",
        }}
      >
        {/* lucide "gem", the icon beside the instance name in the sidebar */}
        <svg
          width={gem}
          height={gem}
          viewBox="0 0 24 24"
          fill="none"
          stroke="#78aefc"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 3h12l4 6-10 13L2 9Z" fill="rgba(37, 99, 235, 0.35)" />
          <path d="M11 3 8 9l4 13 4-13-3-6" />
          <path d="M2 9h20" />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
