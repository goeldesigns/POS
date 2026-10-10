"use client";

import { Printer, X } from "lucide-react";
import { useEffect } from "react";

/**
 * Browser print driver. Opens the system print dialog sized for thermal
 * paper. A future ESC/POS driver (USB/network printer via a local bridge)
 * can render the same document model without changing callers.
 */
export function AutoPrint({ auto = true }: { auto?: boolean }) {
  useEffect(() => {
    if (!auto) return;
    const t = setTimeout(() => window.print(), 350);
    return () => clearTimeout(t);
  }, [auto]);
  return (
    <div className="no-print fixed top-3 right-3 flex gap-2">
      <button suppressHydrationWarning type="button" onClick={() => window.print()} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand-500 px-3 text-xs font-medium text-white">
        <Printer className="size-3.5" /> Print
      </button>
      <button suppressHydrationWarning type="button" onClick={() => window.close()} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-xs font-medium text-ink">
        <X className="size-3.5" /> Close
      </button>
    </div>
  );
}
