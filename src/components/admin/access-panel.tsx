"use client";

import { Lock, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { PermissionMatrix } from "@/components/permissions/permission-matrix";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/controls";
import { Avatar, Badge, Card, CardHeader, EmptyState } from "@/components/ui/display";
import { useAction } from "@/hooks/use-action";
import { ALL_PERMISSION_KEYS, CORE_MODULES, MODULE_CATALOG, MODULE_KEYS, type ModuleKey } from "@/lib/permissions/catalog";
import { computeEffectivePermissions } from "@/lib/permissions/can";
import { cn } from "@/lib/utils";
import { setRestaurantMemberPermissionsAction, setRestaurantModulesAction } from "@/server/actions/platform";
import type { AdminMember } from "@/server/services/platform";
import type { RoleOption } from "./members";

/** Switch modules on or off for one restaurant (overrides the plan). */
export function ModuleAccess({
  restaurantId,
  enabled,
  planModules,
  planName,
  readOnly,
}: {
  restaurantId: string;
  enabled: string[];
  planModules: string[];
  planName: string | null;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = React.useState(() => new Set(enabled));
  React.useEffect(() => setValue(new Set(enabled)), [enabled]);
  const plan = new Set(planModules);
  const dirty = value.size !== enabled.length || enabled.some((m) => !value.has(m));
  const save = useAction(setRestaurantModulesAction, {
    success: (r) => (r.enabled || r.disabled ? "Modules updated — users see the change on their next page load" : "No changes"),
    onSuccess: () => router.refresh(),
  });
  const groups = [...new Set(MODULE_KEYS.map((m) => MODULE_CATALOG[m].group))];

  return (
    <Card>
      <CardHeader
        title="Modules"
        description={`Switching a module off hides it from every user's navigation and blocks its pages and API — even for owners.${planName ? ` Defaults come from the ${planName} plan.` : ""}`}
        actions={
          !readOnly ? (
            <Button variant="ghost" size="sm" onClick={() => setValue(new Set(planModules))}>
              <RotateCcw /> Match plan
            </Button>
          ) : null
        }
      />
      <div className="grid gap-x-8 border-t border-line px-5 py-4 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((g) => (
          <div key={g} className="py-2">
            <p className="mb-1.5 text-2xs font-semibold tracking-wide text-subtle uppercase">{g}</p>
            <ul className="divide-y divide-line">
              {MODULE_KEYS.filter((m) => MODULE_CATALOG[m].group === g).map((m) => {
                const core = CORE_MODULES.includes(m);
                const on = core || value.has(m);
                const inPlan = plan.has(m);
                return (
                  <li key={m} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className={cn("flex flex-wrap items-center gap-1.5 text-[13px] font-medium", on ? "text-ink" : "text-muted")}>
                        {MODULE_CATALOG[m].label}
                        {core ? (
                          <Badge size="sm">
                            <Lock className="size-2.5" /> Core
                          </Badge>
                        ) : on && !inPlan ? (
                          <Badge size="sm" tone="warning">
                            Override
                          </Badge>
                        ) : !on && inPlan ? (
                          <Badge size="sm" tone="danger">
                            Off · in plan
                          </Badge>
                        ) : null}
                      </p>
                      <p className="truncate text-xs text-muted">{MODULE_CATALOG[m].description}</p>
                    </div>
                    <Switch
                      checked={on}
                      disabled={core || readOnly}
                      aria-label={`${MODULE_CATALOG[m].label} module`}
                      onCheckedChange={(v) => {
                        const next = new Set(value);
                        if (v) next.add(m);
                        else next.delete(m);
                        setValue(next);
                      }}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      {dirty && !readOnly ? (
        <div className="flex items-center justify-end gap-2 rounded-b-[var(--radius-card)] border-t border-line bg-canvas/60 px-5 py-3">
          <p className="mr-auto text-xs text-muted">Unsaved module changes</p>
          <Button variant="outline" size="sm" onClick={() => setValue(new Set(enabled))}>
            Discard
          </Button>
          <Button size="sm" loading={save.pending} onClick={() => save.execute({ restaurantId, modules: [...value] })}>
            Save modules
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

/** Pick a person, edit their module × action matrix. */
export function UserPermissionsPanel({
  restaurantId,
  members,
  roles,
  enabledModules,
  readOnly,
}: {
  restaurantId: string;
  members: AdminMember[];
  roles: RoleOption[];
  enabledModules: string[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = React.useState<string | null>(members.find((m) => !m.role.isOwner)?.id ?? members[0]?.id ?? null);
  const member = members.find((m) => m.id === selectedId) ?? null;
  const role = roles.find((r) => r.id === member?.role.id);
  const baseline = React.useMemo(() => new Set(role?.permissions ?? []), [role]);
  const initial = React.useMemo(() => {
    if (!member || !role) return new Set<string>();
    if (role.isOwner) return new Set<string>(ALL_PERMISSION_KEYS);
    return new Set<string>(
      computeEffectivePermissions({
        isOwner: false,
        rolePermissions: role.permissions,
        overrides: member.overrides,
        enabledModules: MODULE_KEYS as readonly ModuleKey[],
      }),
    );
  }, [member, role]);
  const [value, setValue] = React.useState<Set<string>>(initial);
  React.useEffect(() => setValue(initial), [initial]);
  const dirty = value.size !== initial.size || [...value].some((k) => !initial.has(k));
  const save = useAction(setRestaurantMemberPermissionsAction, {
    success: "Permissions saved",
    onSuccess: () => router.refresh(),
  });

  if (!members.length) {
    return (
      <Card>
        <EmptyState title="No users to configure" description="Add a user first, then fine-tune their permissions here." />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader title="User permissions" description="Each person starts from their role. Changes here are stored as per-person grants or removals." />
      <div className="grid border-t border-line lg:grid-cols-[250px_minmax(0,1fr)]">
        <ul className="max-h-[560px] overflow-y-auto border-b border-line p-2 scrollbar-thin lg:border-r lg:border-b-0" role="listbox" aria-label="Users">
          {members.map((m) => {
            const active = m.id === selectedId;
            const overrides = m.overrides.length;
            return (
              <li key={m.id}>
                <button
                  suppressHydrationWarning
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => setSelectedId(m.id)}
                  className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left", active ? "bg-brand-50 ring-1 ring-brand-150" : "hover:bg-canvas")}
                >
                  <Avatar name={m.name} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink">{m.name}</span>
                    <span className="block truncate text-xs text-muted">
                      {m.role.name}
                      {overrides && !m.role.isOwner ? ` · ${overrides} change${overrides > 1 ? "s" : ""}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="min-w-0 p-4">
          {member && role ? (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13px] text-muted">
                  <span className="font-medium text-ink">{member.name}</span> · {role.name} role
                  {role.isOwner ? " · owners always have full access to enabled modules" : ""}
                </p>
                {!role.isOwner && !readOnly ? (
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setValue(new Set(baseline))}>
                      Reset to role
                    </Button>
                    <Button
                      size="sm"
                      disabled={!dirty}
                      loading={save.pending}
                      onClick={() => save.execute({ restaurantId, memberId: member.id, permissions: [...value] })}
                    >
                      Save permissions
                    </Button>
                  </div>
                ) : null}
              </div>
              <PermissionMatrix
                value={value}
                onChange={setValue}
                enabledModules={enabledModules}
                baseline={role.isOwner ? undefined : baseline}
                readOnly={role.isOwner || readOnly}
              />
            </>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
