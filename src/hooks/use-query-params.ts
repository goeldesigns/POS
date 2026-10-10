"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";

/**
 * Read/write URL search params for server-driven lists (search, filters,
 * sorting, pagination). Changing anything but `page` resets to page 1.
 */
export function useQueryParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const set = useCallback(
    (updates: Record<string, string | number | null | undefined>, opts: { scroll?: boolean } = {}) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === undefined || value === "") next.delete(key);
        else next.set(key, String(value));
      }
      if (!("page" in updates)) next.delete("page");
      const qs = next.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: opts.scroll ?? false });
      });
    },
    [pathname, router, searchParams],
  );

  const get = useCallback((key: string) => searchParams.get(key), [searchParams]);

  return { get, set, pending, searchParams };
}
