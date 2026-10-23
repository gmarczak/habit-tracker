import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nawyki",
    short_name: "Nawyki",
    description: "Odhacz w 3 sekundy i zobacz postęp.",
    lang: "pl",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f2f2f7",
    theme_color: "#f2f2f7",
    icons: [
      { src: "/icon-192-v2.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512-v2.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512-v2.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
