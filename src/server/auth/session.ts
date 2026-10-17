export const SESSION_COOKIE = {
  PLATFORM: "tabla_admin_session",
  RESTAURANT: "tabla_session",
} as const;

export interface RequestMeta {
  ip?: string | null;
  userAgent?: string | null;
}
