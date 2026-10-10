"use client";

import { Lock } from "lucide-react";
import * as React from "react";
import { Checkbox } from "@/components/ui/controls";
import { Badge } from "@/components/ui/display";
import { ALL_PERMISSIONS, MODULE_CATALOG, MODULE_KEYS, type ModuleKey, type PermissionColumn } from "@/lib/permissions/catalog";
import { cn } from "@/lib/utils";

const COLUMNS: { key: PermissionColumn; label: string }[] = [
  { key: "view", label: "View" },
  { key: "create", label: "Create" },
  { key: "edit", label: "Edit" },
  { key: "delete", label: "Delete" },
  { key: "extra", label: "Other actions" },
];

/**
 * Module × action permission grid. Used for roles, individual users and the
 * Super Admin. Modules not enabled for the restaurant are shown locked.
 * When `baseline` (the role's permissions) is given, overridden cells are
 * marked so admins can see what differs from the role.
 */
export function PermissionMatrix({
  value,
  onChange,
  enabledModules,
  baseline,
  readOnly,
  grantable,
}: {
  value: ReadonlySet<string>;
  onChange?: (next: Set<string>) => void;
  enabledModules?: readonly string[];
  baseline?: ReadonlySet<string>;
  readOnly?: boolean;
  /** Keys the current admin may grant (privilege-escalation guard). */
  grantable?: ReadonlySet<string>;
}) {
  const enabled = new Set(enabledModules ?? MODULE_KEYS);
  const toggle = (keys: string[], on: boolean) => {
    if (readOnly || !onChange) return;
    const next = new Set(value);
    for (const k of keys) {
      if (on && grantable && !grantable.has(k)) continue;
      if (on) next.add(k);
      else next.delete(k);
    }
    // Any action implies view.
    for (const m of MODULE_KEYS) {
      const keysOfModule = ALL_PERMISSIONS.filter((p) => p.module === m).map((p) => p.key);
      if (keysOfModule.some((k) => k !== `${m}.view` && next.has(k))) next.add(`${m}.view`);
    }
    onChange(next);
  };

  const groups = [...new Set(MODULE_KEYS.map((m) => MODULE_CATALOG[m].group))];

  return (
    <div className="overflow-x-auto rounded-xl border border-line scrollbar-thin">
      <table className="w-full min-w-[860px] border-collapse text-[13px]">
        <thead>
          <tr className="bg-canvas/80 text-xs text-muted">
            <th className="sticky left-0 w-[190px] bg-canvas/95 px-4 py-2.5 text-left font-medium">Module</th>
            {COLUMNS.map((c) => (
              <th key={c.key} className={cn("px-3 py-2.5 text-left font-medium", c.key !== "extra" && "w-[118px]")}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <React.Fragment key={group}>
              <tr>
                <td colSpan={6} className="border-t border-line bg-surface px-4 pt-3 pb-1 text-2xs font-semibold tracking-wide text-subtle uppercase">
                  {group}
                </td>
              </tr>
              {MODULE_KEYS.filter((m) => MODULE_CATALOG[m].group === group).map((m) => {
                const perms = ALL_PERMISSIONS.filter((p) => p.module === m);
                const isEnabled = enabled.has(m);
                const keys = perms.map((p) => p.key as string);
                const on = keys.filter((k) => value.has(k)).length;
                const disabled = readOnly || !isEnabled;
                return (
                  <tr key={m} className={cn("border-t border-line", !isEnabled && "bg-canvas/60")}>
                    <td className="sticky left-0 bg-inherit px-4 py-2.5">
                      <label className={cn("flex items-center gap-2.5", !disabled && "cursor-pointer")}>
                        <Checkbox
                          checked={on === 0 ? false : on === keys.length ? true : "indeterminate"}
                          disabled={disabled}
                          onCheckedChange={(c) => toggle(keys, c === true)}
                          aria-label={`All ${MODULE_CATALOG[m].label} permissions`}
                        />
                        <span className={cn("font-medium", isEnabled ? "text-ink" : "text-subtle")}>{MODULE_CATALOG[m].label}</span>
                        {!isEnabled ? (
                          <Badge size="sm">
                            <Lock className="size-2.5" /> Not enabled
                          </Badge>
                        ) : null}
                      </label>
                    </td>
                    {COLUMNS.map((c) => {
                      const cell = perms.filter((p) => p.column === c.key);
                      if (!cell.length) return <td key={c.key} className="px-3 py-2.5 text-subtle">—</td>;
                      return (
                        <td key={c.key} className="px-3 py-2">
                          <div className={cn("flex flex-wrap gap-x-4 gap-y-1.5", c.key !== "extra" && "flex-col")}>
                            {cell.map((p) => {
                              const checked = value.has(p.key);
                              const overridden = baseline ? baseline.has(p.key) !== checked : false;
                              const blocked = !checked && grantable && !grantable.has(p.key);
                              return (
                                <label
                                  key={p.key}
                                  title={blocked ? "You can't grant a permission you don't have" : overridden ? "Differs from the role default" : p.key}
                                  className={cn(
                                    "inline-flex w-fit items-center gap-1.5 text-xs",
                                    !disabled && !blocked && "cursor-pointer",
                                    overridden && "-mx-1 rounded-md bg-warning-50 px-1 ring-1 ring-warning-100",
                                  )}
                                >
                                  <Checkbox checked={checked} disabled={disabled || blocked} onCheckedChange={(v) => toggle([p.key], v === true)} aria-label={`${MODULE_CATALOG[m].label}: ${p.label}`} />
                                  <span className={cn("whitespace-nowrap", isEnabled ? "text-ink-2" : "text-subtle", checked && isEnabled && "text-ink")}>{p.label}</span>
                                </label>
                              );
                            })}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function moduleLabel(m: string) {
  return MODULE_CATALOG[m as ModuleKey]?.label ?? m;
}
