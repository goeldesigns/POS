"use client";

import { Dialog, DialogBody, DialogContent } from "@/components/ui/overlay";
import { Kbd } from "@/components/ui/display";

const GROUPS: { title: string; items: [keys: string[], label: string][] }[] = [
  {
    title: "Anywhere",
    items: [
      [["Ctrl", "K"], "Search & jump to anything"],
      [["F2"], "Open POS"],
      [["?"], "Show this list"],
      [["Esc"], "Close dialog or panel"],
    ],
  },
  {
    title: "POS",
    items: [
      [["/"], "Focus menu search"],
      [["Enter"], "Add the first search result"],
      [["+"], "Increase quantity of selected item"],
      [["−"], "Decrease quantity of selected item"],
      [["Del"], "Remove selected item"],
      [["F4"], "New order (clear cart)"],
      [["F6"], "Dine-in: send to kitchen, pay later"],
      [["F7"], "Save as draft"],
      [["F8"], "Charge / take payment"],
    ],
  },
  {
    title: "Payment dialog",
    items: [
      [["1", "–", "4"], "Cash · Card · UPI · Split"],
      [["Enter"], "Confirm payment"],
    ],
  },
];

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Keyboard shortcuts" description="Work faster at the counter." size="md">
        <DialogBody className="grid gap-6 sm:grid-cols-2">
          {GROUPS.map((g) => (
            <section key={g.title} className={g.title === "POS" ? "sm:row-span-2" : undefined}>
              <h3 className="mb-2 text-2xs font-semibold tracking-wide text-muted uppercase">{g.title}</h3>
              <ul className="space-y-2">
                {g.items.map(([keys, label]) => (
                  <li key={label} className="flex items-center justify-between gap-3 text-[13px] text-ink-2">
                    {label}
                    <span className="flex shrink-0 gap-1">
                      {keys.map((k) => (
                        <Kbd key={k}>{k}</Kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
