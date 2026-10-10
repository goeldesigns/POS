/** Shared constants for the Super Admin console (safe for client and server). */

/** Platform reporting timezone. Restaurant pages use each restaurant's own zone. */
export const PLATFORM_TZ = "Asia/Kolkata";

export const ADMIN_PERIOD_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "90d", label: "3M" },
  { value: "12m", label: "12M" },
  { value: "custom", label: "Custom" },
] as const;

export type AdminPeriod = (typeof ADMIN_PERIOD_OPTIONS)[number]["value"];
