"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface SettingsNavGroup {
  label: string;
  items: { slug: string; label: string; href?: string }[];
}

export function SettingsNav({ groups }: { groups: SettingsNavGroup[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings" className="space-y-5">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="mb-1.5 px-3 text-2xs font-semibold tracking-wide text-subtle uppercase">{g.label}</p>
          <ul className="space-y-0.5">
            {g.items.map((i) => {
              const href = i.href ?? `/app/settings/${i.slug}`;
              const active = pathname === href;
              return (
                <li key={i.slug}>
                  <Link
                    href={href}
                    className={cn(
                      "block rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
                      active ? "bg-brand-100 text-brand-700" : "text-ink-2 hover:bg-sunken hover:text-ink",
                    )}
                  >
                    {i.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
