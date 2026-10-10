"use client";

import { Ellipsis, KeyRound, Pencil, Plus, ShieldCheck, Trash, UserPlus } from "lucide-react";
import * as React from "react";
import { SelectField, TextField, TextareaField, useFormSubmit, useZodForm } from "@/components/forms/fields";
import { PermissionMatrix } from "@/components/permissions/permission-matrix";
import { useSession } from "@/components/shell/session-context";
import { Button } from "@/components/ui/button";
import { Avatar, Badge, Card, EmptyState, StatusBadge } from "@/components/ui/display";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/menu";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/overlay";
import { useAction } from "@/hooks/use-action";
import { formatDateTime } from "@/lib/format";
import { MEMBER_STATUS } from "@/lib/labels";
import { computeEffectivePermissions } from "@/lib/permissions/can";
import { pluralize } from "@/lib/utils";
import { createMemberSchema, roleSchema } from "@/lib/validation/team";
import {
  createMemberAction,
  deleteRoleAction,
  memberPermissionsAction,
  removeMemberAction,
  resetMemberPasswordAction,
  saveRoleAction,
  updateMemberAction,
} from "@/server/actions/settings";

export interface RoleLite {
  id: string;
  name: string;
  description: string | null;
  isOwner: boolean;
  isSystem: boolean;
  members: number;
  permissions: string[];
}

export interface MemberLite {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  lastLoginAt: string | null;
  role: { id: string; name: string; isOwner: boolean };
  overrides: { permissionKey: string; effect: "GRANT" | "DENY" }[];
}

export function UsersSettings({ members, roles, enabledModules }: { members: MemberLite[]; roles: RoleLite[]; enabledModules: string[] }) {
  const session = useSession();
  const [dialog, setDialog] = React.useState<{ kind: "new" | "edit" | "perms" | "password" | "remove"; member: MemberLite | null } | null>(null);
  const remove = useAction(removeMemberAction, { success: "Access removed", onSuccess: () => setDialog(null) });
  const canEdit = session.can("settings.edit");
  const tz = session.restaurant.timezone;
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">Users</h2>
          <p className="text-[13px] text-muted">People who can sign in to {session.restaurant.name}. Permissions come from the role, with optional per-person changes.</p>
        </div>
        {canEdit ? (
          <Button onClick={() => setDialog({ kind: "new", member: null })}>
            <UserPlus /> Add user
          </Button>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-[13px]">
          <thead>
            <tr className="bg-canvas/70 text-xs text-muted">
              {["User", "Role", "Custom permissions", "Status", "Last sign-in", ""].map((h) => (
                <th key={h} className="px-4 py-2.5 text-left font-medium first:pl-5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-t border-line">
                <td className="px-4 py-2.5 pl-5">
                  <div className="flex items-center gap-3">
                    <Avatar name={m.name} size="sm" />
                    <div>
                      <p className="font-medium text-ink">{m.name}{m.userId === session.user.id ? <span className="ml-1.5 text-xs text-muted">(you)</span> : null}</p>
                      <p className="text-xs text-muted">{m.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2.5"><Badge tone={m.role.isOwner ? "brand" : "neutral"}>{m.role.name}</Badge></td>
                <td className="px-4 py-2.5 text-xs text-muted">
                  {m.role.isOwner ? "Full access" : m.overrides.length ? (
                    <span>
                      {m.overrides.filter((o) => o.effect === "GRANT").length ? <span className="text-success-700">+{m.overrides.filter((o) => o.effect === "GRANT").length} granted</span> : null}
                      {m.overrides.filter((o) => o.effect === "GRANT").length && m.overrides.filter((o) => o.effect === "DENY").length ? " · " : null}
                      {m.overrides.filter((o) => o.effect === "DENY").length ? <span className="text-danger-700">−{m.overrides.filter((o) => o.effect === "DENY").length} removed</span> : null}
                    </span>
                  ) : "Role defaults"}
                </td>
                <td className="px-4 py-2.5"><StatusBadge dict={MEMBER_STATUS} value={m.status} size="sm" /></td>
                <td className="px-4 py-2.5 text-muted">{m.lastLoginAt ? formatDateTime(m.lastLoginAt, tz) : "Never"}</td>
                <td className="px-4 py-2.5 pr-5 text-right">
                  {canEdit ? (
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
                        <DropdownMenuItem tone="danger" disabled={m.userId === session.user.id} onSelect={() => setDialog({ kind: "remove", member: m })}>
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
      <CreateMemberDialog open={dialog?.kind === "new"} onOpenChange={(o) => !o && setDialog(null)} roles={roles} />
      <EditMemberDialog open={dialog?.kind === "edit"} onOpenChange={(o) => !o && setDialog(null)} member={dialog?.member ?? null} roles={roles} />
      <MemberPermissionsDialog open={dialog?.kind === "perms"} onOpenChange={(o) => !o && setDialog(null)} member={dialog?.member ?? null} roles={roles} enabledModules={enabledModules} />
      <ResetPasswordDialog open={dialog?.kind === "password"} onOpenChange={(o) => !o && setDialog(null)} member={dialog?.member ?? null} />
      <ConfirmDialog
        open={dialog?.kind === "remove"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Remove ${dialog?.member?.name}'s access?`}
        description="They'll be signed out immediately. Their past orders and activity stay in your records."
        confirmLabel="Remove access"
        loading={remove.pending}
        onConfirm={() => remove.execute({ memberId: dialog!.member!.id })}
      />
    </Card>
  );
}

function CreateMemberDialog({ open, onOpenChange, roles }: { open: boolean; onOpenChange: (o: boolean) => void; roles: RoleLite[] }) {
  const session = useSession();
  const assignable = roles.filter((r) => session.isOwner || !r.isOwner);
  const blank = { name: "", email: "", phone: "", password: "", roleId: assignable.find((r) => r.name === "Cashier")?.id ?? assignable[0]?.id ?? "", status: "ACTIVE" as const };
  const form = useZodForm(createMemberSchema, blank);
  React.useEffect(() => {
    if (open) form.reset(blank);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const submit = useFormSubmit(form, createMemberAction, {
    success: (r) => (r.attachedExisting ? "Existing account given access" : "User created — share the login details privately"),
    onSuccess: () => onOpenChange(false),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add user" description="Creates a login for your restaurant. If the email already has a Tabla account, it's given access instead." size="md">
        <form onSubmit={submit} noValidate className="contents">
          <DialogBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField control={form.control} name="name" label="Full name" required autoFocus />
              <TextField control={form.control} name="phone" label="Phone" optional />
              <TextField control={form.control} name="email" label="Login email" required type="email" />
              <TextField control={form.control} name="password" label="Temporary password" required description="8+ characters with a number" />
              <SelectField control={form.control} name="roleId" label="Role" options={assignable.map((r) => ({ value: r.id, label: r.name }))} />
              <SelectField control={form.control} name="status" label="Status" options={[{ value: "ACTIVE", label: "Active" }, { value: "SUSPENDED", label: "Suspended" }]} />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={form.formState.isSubmitting}>Create user</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditMemberDialog({ open, onOpenChange, member, roles }: { open: boolean; onOpenChange: (o: boolean) => void; member: MemberLite | null; roles: RoleLite[] }) {
  const session = useSession();
  const [roleId, setRoleId] = React.useState("");
  const [status, setStatus] = React.useState("ACTIVE");
  React.useEffect(() => {
    if (open && member) {
      setRoleId(member.role.id);
      setStatus(member.status);
    }
  }, [open, member]);
  const run = useAction(updateMemberAction, { success: "User updated", onSuccess: () => onOpenChange(false) });
  if (!member) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`Edit ${member.name}`} size="sm">
        <DialogBody className="space-y-4">
          <Field label="Role">
            <NativeSelect value={roleId} onChange={(e) => setRoleId(e.target.value)}>
              {roles.filter((r) => session.isOwner || !r.isOwner).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Status" description="Suspended users are signed out and can't sign in.">
            <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
            </NativeSelect>
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={run.pending} onClick={() => run.execute({ memberId: member.id, roleId, status: status as "ACTIVE" | "SUSPENDED" })}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MemberPermissionsDialog({ open, onOpenChange, member, roles, enabledModules }: { open: boolean; onOpenChange: (o: boolean) => void; member: MemberLite | null; roles: RoleLite[]; enabledModules: string[] }) {
  const session = useSession();
  const role = roles.find((r) => r.id === member?.role.id);
  const baseline = React.useMemo(() => new Set(role?.permissions ?? []), [role]);
  const [value, setValue] = React.useState<Set<string>>(new Set());
  React.useEffect(() => {
    if (open && member && role) {
      setValue(new Set(computeEffectivePermissions({ isOwner: false, rolePermissions: role.permissions, overrides: member.overrides, enabledModules: [...new Set([...enabledModules, ...role.permissions.map((p) => p.split(".")[0]!)])] })));
    }
  }, [open, member, role, enabledModules]);
  const run = useAction(memberPermissionsAction, { success: "Permissions saved", onSuccess: () => onOpenChange(false) });
  if (!member || !role) return null;
  const grantable = session.isOwner ? undefined : new Set(session.permissions);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`Permissions · ${member.name}`} description={`Starts from the ${role.name} role. Highlighted cells differ from the role.`} size="2xl">
        <DialogBody>
          <PermissionMatrix value={value} onChange={setValue} enabledModules={enabledModules} baseline={baseline} grantable={grantable} />
        </DialogBody>
        <DialogFooter className="justify-between">
          <Button variant="ghost" onClick={() => setValue(new Set(baseline))}>Reset to role defaults</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button loading={run.pending} onClick={() => run.execute({ memberId: member.id, permissions: [...value] })}>Save permissions</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ open, onOpenChange, member }: { open: boolean; onOpenChange: (o: boolean) => void; member: MemberLite | null }) {
  const [password, setPassword] = React.useState("");
  React.useEffect(() => {
    if (open) setPassword("");
  }, [open]);
  const run = useAction(resetMemberPasswordAction, { success: "Password reset — they've been signed out everywhere", onSuccess: () => onOpenChange(false) });
  if (!member) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`Reset password for ${member.name}`} size="sm">
        <DialogBody>
          <Field label="New temporary password" description="8+ characters with a letter and a number. Share it privately.">
            <Input value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={run.pending} disabled={password.length < 8} onClick={() => run.execute({ memberId: member.id, password })}>Reset password</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Roles ──────────────────────────────────────────────────────────────────

export function RolesSettings({ roles, enabledModules, customRolesAllowed }: { roles: RoleLite[]; enabledModules: string[]; customRolesAllowed: boolean }) {
  const session = useSession();
  const [editing, setEditing] = React.useState<RoleLite | "new" | null>(null);
  const [deleting, setDeleting] = React.useState<RoleLite | null>(null);
  const del = useAction(deleteRoleAction, { success: "Role deleted", onSuccess: () => setDeleting(null) });
  const canEdit = session.can("settings.edit");
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">Roles & permissions</h2>
          <p className="text-[13px] text-muted">Roles are permission templates. Change a role and everyone in it updates.</p>
        </div>
        {canEdit ? (
          <Button onClick={() => setEditing("new")} disabled={!customRolesAllowed} title={customRolesAllowed ? undefined : "Custom roles need the Professional plan or higher"}>
            <Plus /> New role
          </Button>
        ) : null}
      </div>
      {roles.length === 0 ? (
        <EmptyState title="No roles" />
      ) : (
        <ul className="divide-y divide-line">
          {roles.map((r) => (
            <li key={r.id} className="flex items-center gap-4 px-5 py-3">
              <span className="grid size-9 place-items-center rounded-lg bg-brand-100 text-brand-500">
                <ShieldCheck className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-ink">
                  {r.name} {r.isSystem ? <Badge size="sm">System</Badge> : <Badge size="sm" tone="brand">Custom</Badge>}
                </p>
                <p className="truncate text-xs text-muted">{r.description ?? "—"}</p>
              </div>
              <span className="text-xs text-muted">{r.isOwner ? "All permissions" : pluralize(r.permissions.length, "permission")}</span>
              <span className="w-[80px] text-right text-xs text-muted">{r.members} {r.members === 1 ? "person" : "people"}</span>
              <div className="flex w-[64px] justify-end gap-1">
                {canEdit && !r.isOwner ? (
                  <Button variant="ghost" size="icon-xs" aria-label={`Edit ${r.name}`} onClick={() => setEditing(r)}>
                    <Pencil />
                  </Button>
                ) : null}
                {canEdit && !r.isSystem ? (
                  <Button variant="ghost" size="icon-xs" aria-label={`Delete ${r.name}`} onClick={() => setDeleting(r)}>
                    <Trash />
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      <RoleDialog value={editing === "new" ? null : editing} open={!!editing} onOpenChange={(o) => !o && setEditing(null)} enabledModules={enabledModules} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description={deleting?.members ? "Move its members to another role first." : "This custom role will be removed."}
        confirmLabel="Delete role"
        loading={del.pending}
        onConfirm={() => del.execute({ id: deleting!.id })}
      />
    </Card>
  );
}

function RoleDialog({ value, open, onOpenChange, enabledModules }: { value: RoleLite | null; open: boolean; onOpenChange: (o: boolean) => void; enabledModules: string[] }) {
  const session = useSession();
  const form = useZodForm(roleSchema, { name: "", description: "", permissions: [] });
  const [perms, setPerms] = React.useState<Set<string>>(new Set());
  React.useEffect(() => {
    if (!open) return;
    form.reset(value ? { id: value.id, name: value.name, description: value.description ?? "", permissions: value.permissions } : { name: "", description: "", permissions: [] });
    setPerms(new Set(value?.permissions ?? ["overview.view"]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, value]);
  const submit = useFormSubmit(form, (input: Parameters<typeof saveRoleAction>[0]) => saveRoleAction({ ...input, permissions: [...perms] }), {
    success: value ? "Role updated" : "Role created",
    onSuccess: () => onOpenChange(false),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={value ? `Edit role · ${value.name}` : "New role"} size="2xl">
        <form onSubmit={submit} noValidate className="contents">
          <DialogBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[240px_1fr]">
              <TextField control={form.control} name="name" label="Role name" required disabled={value?.isSystem} />
              <TextareaField control={form.control} name="description" label="Description" optional className="[&_textarea]:min-h-[36px]" />
            </div>
            <PermissionMatrix value={perms} onChange={setPerms} enabledModules={enabledModules} grantable={session.isOwner ? undefined : new Set(session.permissions)} />
          </DialogBody>
          <DialogFooter>
            <span className="mr-auto text-xs text-muted">{perms.size} permissions selected</span>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={form.formState.isSubmitting}>Save role</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
