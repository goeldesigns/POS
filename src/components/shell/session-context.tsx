"use client";

import { createContext, useContext, useMemo } from "react";
import type { PermissionKey } from "@/lib/permissions/catalog";

export interface ClientSession {
  user: { id: string; name: string; email: string; avatarUrl: string | null };
  restaurant: { id: string; name: string; city: string | null; currency: string; timezone: string; locale: string; status: string };
  role: string;
  isOwner: boolean;
  permissions: string[];
  modules: string[];
  plan: { key: string; name: string } | null;
}

const SessionContext = createContext<(ClientSession & { can: (key: PermissionKey) => boolean }) | null>(null);

export function SessionProvider({ value, children }: { value: ClientSession; children: React.ReactNode }) {
  const ctx = useMemo(() => {
    const set = new Set(value.permissions);
    return { ...value, can: (key: PermissionKey) => set.has(key) };
  }, [value]);
  return <SessionContext.Provider value={ctx}>{children}</SessionContext.Provider>;
}

/** Client-side permission checks — UI convenience only; the server enforces. */
export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside the restaurant app shell");
  return ctx;
}
