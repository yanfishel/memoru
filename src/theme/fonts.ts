import { Inter, Literata } from "next/font/google";

/** Self-hosted at build time by next/font: the browser never contacts Google (spec §2). */
export const sans = Inter({ subsets: ["cyrillic", "latin"], variable: "--font-inter", display: "swap" });

export const serif = Literata({
  subsets: ["cyrillic", "latin"],
  style: ["normal", "italic"],
  variable: "--font-literata",
  display: "swap",
});
