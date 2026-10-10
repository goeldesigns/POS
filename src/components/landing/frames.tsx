import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

/** Minimal desktop browser chrome around a product screenshot. */
export function BrowserFrame({ label, className, children, dark }: { label: string; className?: string; children: React.ReactNode; dark?: boolean }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[14px] border shadow-[0_40px_80px_-30px_rgb(36_28_110/0.35),0_12px_24px_-12px_rgb(36_28_110/0.18)]",
        dark ? "border-white/10 bg-night-2" : "border-line bg-surface",
        className,
      )}
    >
      <div className={cn("flex h-9 items-center gap-3 border-b px-3.5", dark ? "border-white/10" : "border-line bg-canvas")}>
        <span className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
        </span>
        <span
          className={cn(
            "mx-auto flex h-6 w-full max-w-[280px] items-center justify-center gap-1.5 rounded-md px-3 text-[11px] font-medium",
            dark ? "bg-white/5 text-white/50" : "bg-surface text-muted ring-1 ring-line",
          )}
        >
          <Lock className="size-3" aria-hidden /> {label}
        </span>
        <span className="w-[42px]" aria-hidden />
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}

/** Phone bezel for mobile screenshots. */
export function PhoneFrame({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-[30px] bg-night p-[7px] shadow-[0_30px_60px_-20px_rgb(22_21_42/0.55)] ring-1 ring-black/10", className)}>
      <div className="relative overflow-hidden rounded-[24px] bg-surface">
        <span className="absolute top-2 left-1/2 z-10 h-[14px] w-[64px] -translate-x-1/2 rounded-full bg-night" aria-hidden />
        <div className="max-h-[360px] overflow-hidden lg:max-h-[400px]">{children}</div>
      </div>
    </div>
  );
}
