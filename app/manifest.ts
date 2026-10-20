import type { MetadataRoute } from "next";

/** Makes the app installable (home screen, dock, app list), opening without browser chrome. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Obsidian Chat",
    short_name: "Obsidian",
    description: "Real-time group chat",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0b1222",
    theme_color: "#0b1222",
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
