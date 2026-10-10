"use client";

import { UtensilsCrossed } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const PALETTE = ["#f0eeff", "#fdeee6", "#e3f6ee", "#fdf3dc", "#fbe9f0", "#e7f0fd"];

/** Product photo with a calm placeholder when missing or broken. */
export function ProductImage({ src, name, className }: { src: string | null; name: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    const bg = PALETTE[name.length % PALETTE.length];
    return (
      <div className={cn("grid place-items-center text-muted", className)} style={{ background: bg }} aria-hidden>
        <UtensilsCrossed className="size-[30%] max-h-8 max-w-8 opacity-50" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={cn("object-cover", className)}
    />
  );
}
