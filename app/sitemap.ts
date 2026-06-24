import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://flowviahealth.com";
  return ["", "/sms-consent", "/privacy", "/terms", "/hipaa", "/contact"].map((path) => ({ url: `${base}${path}`, lastModified: new Date(), changeFrequency: path === "" ? "monthly" : "yearly", priority: path === "" ? 1 : .7 }));
}
