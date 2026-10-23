/** Canonical public address. Keep in step with the primary domain in Vercel. */
export const SITE_URL = (process.env.SITE_URL ?? "https://www.tablapos.com").replace(/\/$/, "");

export const SITE = {
  url: SITE_URL,
  locale: "en_IN",
  ogImage: "/landing/pos.webp",
  ogImageSize: { width: 2880, height: 1800 },
  keywords: [
    "restaurant POS software",
    "restaurant billing software",
    "cafe POS",
    "GST billing software for restaurants",
    "restaurant POS India",
    "KOT software",
    "recipe based inventory restaurant",
    "cloud POS for restaurants",
    "Swiggy Zomato order integration POS",
    "multi outlet restaurant POS",
  ],
} as const;
