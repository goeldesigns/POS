import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { BRAND } from "@/config/brand";

export default function AdminAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col bg-night px-4 py-6 sm:px-8">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage: "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
        aria-hidden
      />
      <Link href="/super-admin/login" className="relative w-fit">
        <Logo inverted subtitle="Platform console" />
      </Link>
      <div className="relative flex flex-1 items-center justify-center py-10">
        <div className="w-full max-w-[420px] rounded-2xl bg-surface p-7 shadow-pop sm:p-8">{children}</div>
      </div>
      <p className="relative flex items-center gap-1.5 text-xs text-white/45">
        <ShieldCheck className="size-3.5" /> Restricted to {BRAND.name} platform administrators. Every sign-in is logged.
      </p>
    </div>
  );
}
