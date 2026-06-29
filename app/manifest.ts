import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Flowvia Health",
    short_name: "Flowvia",
    description: "Healthcare workflow and patient communication technology owned, developed, and operated by Onzeon Holdings LLC.",
    start_url: "/",
    display: "standalone",
    background_color: "#F5F7FA",
    theme_color: "#0A2540",
    icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
