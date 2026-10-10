"use client";

import { Ellipsis, KeyRound, Pencil, ShieldCheck, Trash, UserPlus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { SelectField, TextField, useFormSubmit, useZodForm } from "@/components/forms/fields";
import { PermissionMatrix } from "@/components/permissions/permission-matrix";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/controls";
import { Avatar, Badge, EmptyState, StatusBadge } from "@/components/ui/display";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/menu";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/overlay";
import { useAction } from "@/hooks/use-action";
import { PLATFORM_TZ } from "@/lib/admin";
import { formatDateTime, formatRelative } from "@/lib/format";
import { MEMBER_STATUS } from "@/lib/labels";
import { computeEffectivePermissions } from "@/lib/permissions/can";
import { createPlatformUserSchema } from "@/lib/validation/platform";
import {
  createRestaurantUserAction,
  getRestaurantRolesAction,
  removeRestaurantMemberAction,
  resetRestaurantMemberPasswordAction,
  setRestaurantMemberPermissionsAction,
  updateRestaurantMemberAction,
} from "@/server/actions/platform";
import type { AdminMember } from "@/server/services/platform";

export interface RoleOption {
  id: string;
  name: string;
  isOwner: boolean;
  permissions: string[];
}

function overrideSummary(m: AdminMember) {
  if (m.role.isOwner) return <span className="text-muted">Full access</span>;
  const granted = m.overrides.filter((o) => o.effect === "GRANT").length;
  const removed = m.overrides.filter((o) => o.effect === "DENY").length;
  if (!granted && !removed) return <span className="text-muted">Role defaults</span>;
  return (
    <span>
      {granted ? <span className="text-success-700">+{granted} granted</span> : null}
      {granted && removed ? <span className="text-muted"> · </span> : null}
      {removed ? <span className="text-danger-700">−{removed} removed</span> : null}
    </span>
  );
}

export function RestaurantMembers({
  restaurantId,
  restaurantName,
  members,
  roles,
  enabledModules,
  readOnly,
}: {
  restaurantId: string;
  restaurantName: string;
  members: AdminMember[];
  roles: RoleOption[];
  enabledModules: string[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = React.useState<{ kind: "new" | "edit" | "perms" | "password" | "remove"; member: AdminMember | null } | null>(null);
  const close = () => setDialog(null);
  const remove = useAction(removeRestaurantMemberAction, {
    success: "Access removed",
    onSuccess: () => {
      close();
      router.refresh();
    },
  });

  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">Users</h2>
          <p className="text-[13px] text-muted">People who can sign in to {restaurantName}. Changes you make are recorded in the restaurant&apos;s activity log.</p>
        </div>
        {!readOnly ? (
          <Button onClick={() => setDialog({ kind: "new", member: null })}>
            <UserPlus /> Add user
          </Button>
        ) : null}
      </div>
      {members.length === 0 ? (
        <EmptyState icon={<Users />} title="No users yet" description="Add the owner or a manager so they can sign in." />
      ) : (
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[820px] text-[13px]">
            <thead>
              <tr className="bg-canvas/70 text-xs text-muted">
                {["User", "Role", "Permissions", "Status", "Last sign-in", ""].map((h, i) => (
                  <th key={i} className="px-4 py-2.5 text-left font-medium first:pl-5">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-t border-line">
                  <td className="px-4 py-2.5 pl-5">
                    <div className="flex items-center gap-3">
                      <Avatar name={m.name} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">
                          {m.name}
                          {m.userStatus === "DISABLED" ? (
                            <Badge size="sm" tone="danger" className="ml-2 align-middle">
                              Sign-in disabled
                            </Badge>
                          ) : null}
                        </p>
                        <p className="truncate text-xs text-muted">{m.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={m.role.isOwner ? "brand" : "neutral"}>{m.role.name}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-xs">{overrideSummary(m)}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge dict={MEMBER_STATUS} value={m.status} size="sm" />
                  </td>
                  <td className="px-4 py-2.5 text-ink-2">
                    {m.lastLoginAt ? <span title={formatDateTime(m.lastLoginAt, PLATFORM_TZ)}>{formatRelative(m.lastLoginAt)}</span> : <span className="text-subtle">Never</span>}
                  </td>
                  <td className="px-4 py-2.5 pr-5 text-right">
                    {!readOnly ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-xs" aria-label={`${m.name} actions`}>
                            <Ellipsis />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-[210px]">
                          <DropdownMenuItem onSelect={() => setDialog({ kind: "edit", member: m })}>
                            <Pencil /> Change role / status
                          </DropdownMenuItem>
                          <DropdownMenuItem disabled={m.role.isOwner} onSelect={() => setDialog({ kind: "perms", member: m })}>
                            <ShieldCheck /> Edit permissions
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setDialog({ kind: "password", member: m })}>
                            <KeyRound /> Reset password
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem tone="danger" onSelect={() => setDialog({ kind: "remove", member: m })}>
                            <Trash /> Remove access
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddUserDialog open={dialog?.kind === "new"} onOpenChange={(o) => !o && close()} restaurantId={restaurantId} roles={roles} enabledModules={enabledModules} />
      <EditMemberDialog open={dialog?.kind === "edit"} onOpenChange={(o) => !o && close()} restaurantId={restaurantId} member={dialog?.member ?? null} roles={roles} />
      <MemberPermissionsDialog
        open={dialog?.kind === "perms"}
        onOpenChange={(o) => !o && close()}
        restaurantId={restaurantId}
        member={dialog?.member ?? null}
        roles={roles}
        enabledModules={enabledModules}
      />
      <ResetPasswordDialog open={dialog?.kind === "password"} onOpenChange={(o) => !o && close()} restaurantId={restaurantId} member={dialog?.member ?? null} />
      <ConfirmDialog
        open={dialog?.kind === "remove"}
        onOpenChange={(o) => !o && close()}
        title={`Remove ${dialog?.member?.name ?? "this user"}'s access?`}
        description={`They'll be signed out of ${restaurantName} immediately. Their past orders and activity stay on record. A restaurant must keep at least one active owner.`}
        confirmLabel="Remove access"
        loading={remove.pending}
        onConfirm={() => remove.execute({ restaurantId, memberId: dialog!.member!.id })}
      />
    </div>
  );
}

// ─── Add user (fixed restaurant, or pick one) ───────────────────────────────

export function AddUserDialog({
  open,
  onOpenChange,
  restaurantId: fixedRestaurantId,
  roles: initialRoles,
  enabledModules,
  restaurants,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restaurantId?: string;
  roles?: RoleOption[];
  enabledModules?: string[];
  restaurants?: { id: string; name: string; city: string | null }[];
}) {
  const router = useRouter();
  const [roles, setRoles] = React.useState<RoleOption[]>(initialRoles ?? []);
  const [loadingRoles, setLoadingRoles] = React.useState(false);
  const [customize, setCustomize] = React.useState(false);
  const [perms, setPerms] = React.useState<Set<string>>(new Set());

  const blank = {
    restaurantId: fixedRestaurantId ?? "",
    name: "",
    email: "",
    phone: "",
    password: "",
    roleId: "",
    status: "ACTIVE" as const,
  };
  const form = useZodForm(createPlatformUserSchema, blank);
  const restaurantId = form.watch("restaurantId");
  const roleId = form.watch("roleId");
  const role = roles.find((r) => r.id === roleId);

  const defaultRole = (list: RoleOption[]) => list.find((r) => r.name === "Manager")?.id ?? list.find((r) => !r.isOwner)?.id ?? list[0]?.id ?? "";

  React.useEffect(() => {
    if (!open) return;
    form.reset(blank);
    setCustomize(false);
    if (initialRoles) {
      setRoles(initialRoles);
      form.setValue("roleId", defaultRole(initialRoles));
    } else setRoles([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  React.useEffect(() => {
    if (!open || fixedRestaurantId || !restaurantId) return;
    let cancelled = false;
    setLoadingRoles(true);
    void getRestaurantRolesAction({ restaurantId }).then((res) => {
      if (cancelled) return;
      setLoadingRoles(false);
      const list = res.ok ? res.data : [];
      setRoles(list);
      form.setValue("roleId", defaultRole(list));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, open, fixedRestaurantId]);

  React.useEffect(() => {
    setPerms(new Set(role?.permissions ?? []));
  }, [role]);

  const submit = useFormSubmit(
    form,
    (input: Parameters<typeof createRestaurantUserAction>[0]) =>
      createRestaurantUserAction({ ...input, permissions: customize && role && !role.isOwner ? [...perms] : undefined }),
    {
      success: (r) => (r.attachedExisting ? "Existing account given access" : "User created — share the login details privately"),
      onSuccess: () => {
        onOpenChange(false);
        router.refresh();
      },
    },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Add user"
        description="Creates a login for the restaurant. If the email already has an account, that person is given access instead."
        size={customize ? "2xl" : "md"}
      >
        <form onSubmit={submit} noValidate className="contents">
          <DialogBody className="space-y-4">
            {!fixedRestaurantId ? (
              <SelectField
                control={form.control}
                name="restaurantId"
                label="Restaurant"
                placeholder="Choose a restaurant"
                options={(restaurants ?? []).map((r) => ({ value: r.id, label: r.city ? `${r.name} · ${r.city}` : r.name }))}
              />
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField control={form.control} name="name" label="Full name" required autoFocus={!!fixedRestaurantId} />
              <TextField control={form.control} name="phone" label="Phone" optional />
              <TextField control={form.control} name="email" label="Login email" required type="email" />
              <TextField control={form.control} name="password" label="Temporary password" required autoComplete="new-password" description="8+ characters with a letter and a number" />
              <SelectField
                control={form.control}
                name="roleId"
                label="Role"
                disabled={!restaurantId || loadingRoles}
                placeholder={loadingRoles ? "Loading roles…" : restaurantId ? undefined : "Choose a restaurant first"}
                options={roles.map((r) => ({ value: r.id, label: r.name }))}
              />
              <SelectField
                control={form.control}
                name="status"
                label="Status"
                options={[
                  { value: "ACTIVE", label: "Active" },
                  { value: "SUSPENDED", label: "Suspended" },
                ]}
              />
            </div>
            {role && !role.isOwner ? (
              <label className="flex w-fit cursor-pointer items-center gap-2.5 text-[13px] text-ink-2">
                <Checkbox checked={customize} onCheckedChange={(v) => setCustomize(v === true)} />
                Customise permissions for this person
              </label>
            ) : role?.isOwner ? (
              <p className="text-xs text-muted">Owners always have every permission of every enabled module.</p>
            ) : null}
            {customize && role && !role.isOwner ? (
              <PermissionMatrix value={perms} onChange={setPerms} enabledModules={enabledModules} baseline={new Set(role.permissions)} />
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting} disabled={!roleId}>
              Create user
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditMemberDialog({
  open,
  onOpenChange,
  restaurantId,
  member,
  roles,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  restaurantId: string;
  member: AdminMember | null;
  roles: RoleOption[];
}) {
  const router = useRouter();
  const [roleId, setRoleId] = React.useState("");
  const [status, setStatus] = React.useState<"ACTIVE" | "SUSPENDED">("ACTIVE");
  React.useEffect(() => {
    if (open && member) {
      setRoleId(member.role.id);
      setStatus(member.status as "ACTIVE" | "SUSPENDED");
    }
  }, [open, member]);
  const run = useAction(updateRestaurantMemberAction, {
    success: "User updated",
    onSuccess: () => {
      onOpenChange(false);
      router.refresh();
    },
  });
  if (!member) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`Edit ${member.name}`} size="sm">
        <DialogBody className="space-y-4">
          <Field label="Role" description="Changing the role keeps any per-person permission changes.">
            <NativeSelect value={roleId} onChange={(e) => setRoleId(e.target.value)}>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Status" description="Suspended users are signed out of this restaurant and can't sign in to it.">
            <NativeSelect value={status} onChange={(e) => setStatus(e.target.value as "ACTIVE" | "SUSPENDED")}>
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
            </NativeSelect>
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={run.pending} onClick={() => run.execute({ restaurantId, memberId: member.id, roleId, status })}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MemberPermissionsDialog({
  open,
  onOpenChange,
  restaurantId,
  member,
  roles,
  enabledModules,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  restaurantId: string;
  member: AdminMember | null;
  roles: RoleOption[];
  enabledModules: string[];
}) {
  const router = useRouter();
  const role = roles.find((r) => r.id === member?.role.id);
  const baseline = React.useMemo(() => new Set(role?.permissions ?? []), [role]);
  const [value, setValue] = React.useState<Set<string>>(new Set());
  React.useEffect(() => {
    if (open && member && role) {
      // Show stored intent, including keys for modules that are switched off.
      setValue(
        new Set(
          computeEffectivePermissions({
            isOwner: false,
            rolePermissions: role.permissions,
            overrides: member.overrides,
            enabledModules: [...new Set([...enabledModules, ...role.permissions.map((p) => p.split(".")[0]!), ...member.overrides.map((o) => o.permissionKey.split(".")[0]!)])],
          }),
        ),
      );
    }
  }, [open, member, role, enabledModules]);
  const run = useAction(setRestaurantMemberPermissionsAction, {
    success: "Permissions saved",
    onSuccess: () => {
      onOpenChange(false);
      router.refresh();
    },
  });
  if (!member || !role) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`Permissions · ${member.name}`} description={`Starts from the ${role.name} role. Highlighted cells differ from the role.`} size="2xl">
        <DialogBody>
          <PermissionMatrix value={value} onChange={setValue} enabledModules={enabledModules} baseline={baseline} />
        </DialogBody>
        <DialogFooter className="justify-between">
          <Button variant="ghost" onClick={() => setValue(new Set(baseline))}>
            Reset to role defaults
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button loading={run.pending} onClick={() => run.execute({ restaurantId, memberId: member.id, permissions: [...value] })}>
              Save permissions
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({
  open,
  onOpenChange,
  restaurantId,
  member,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  restaurantId: string;
  member: AdminMember | null;
}) {
  const [password, setPassword] = React.useState("");
  React.useEffect(() => {
    if (open) setPassword("");
  }, [open]);
  const run = useAction(resetRestaurantMemberPasswordAction, { success: "Password reset — they've been signed out everywhere", onSuccess: () => onOpenChange(false) });
  if (!member) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`Reset password for ${member.name}`} description="Applies to every restaurant this person can access." size="sm">
        <DialogBody>
          <Field label="New temporary password" description="8+ characters with a letter and a number. Share it privately.">
            <Input value={password} onChange={(e) => setPassword(e.target.value)} autoFocus autoComplete="new-password" />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={run.pending} disabled={password.length < 8} onClick={() => run.execute({ restaurantId, memberId: member.id, password })}>
            Reset password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
