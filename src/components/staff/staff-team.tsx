"use client";

import { CalendarDays, Ellipsis, IdCard, KeyRound, Pencil, Plus, Trash } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { SelectField, TextField, TextareaField, useFormSubmit, useZodForm } from "@/components/forms/fields";
import { useSession } from "@/components/shell/session-context";
import { Button } from "@/components/ui/button";
import { Avatar, Badge, EmptyState, StatusBadge } from "@/components/ui/display";
import { DataTable, Pagination, type Column } from "@/components/ui/data-table";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/menu";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/overlay";
import { useAction } from "@/hooks/use-action";
import { formatDate, formatMoney, formatPhone, todayISO } from "@/lib/format";
import { ATTENDANCE_STATUS, STAFF_STATUS } from "@/lib/labels";
import { toDateInputValue } from "@/lib/validation/helpers";
import { STAFF_ROLE_TITLES, staffSchema } from "@/lib/validation/team";
import { deleteStaffAction, giveLoginAccessAction, saveStaffAction } from "@/server/actions/staff";
import type { StaffRow } from "@/server/services/staff";

export function StaffDialog({ open, onOpenChange, value, nextCode }: { open: boolean; onOpenChange: (o: boolean) => void; value: StaffRow | null; nextCode: string }) {
  const session = useSession();
  const today = todayISO(session.restaurant.timezone);
  const blank = { name: "", email: "", phone: "", roleTitle: "Waiter", employeeCode: nextCode, status: "ACTIVE" as const, joiningDate: today, salary: "", address: "", emergencyContact: "" };
  const form = useZodForm(staffSchema, blank);
  React.useEffect(() => {
    if (!open) return;
    form.reset(
      value
        ? {
            id: value.id, name: value.name, email: value.email ?? "", phone: value.phone, roleTitle: value.roleTitle, employeeCode: value.employeeCode, status: value.status,
            joiningDate: toDateInputValue(value.joiningDate), salary: String(value.salary / 100), address: value.address ?? "", emergencyContact: value.emergencyContact ?? "",
          }
        : { ...blank, employeeCode: nextCode },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, value]);
  const submit = useFormSubmit(form, saveStaffAction, { success: value ? "Staff record updated" : "Team member added", onSuccess: () => onOpenChange(false) });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={value ? `Edit ${value.name}` : "Add team member"} description="HR record. Give them a POS login separately if needed." size="lg">
        <form onSubmit={submit} noValidate className="contents">
          <DialogBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <TextField control={form.control} name="name" label="Full name" required autoFocus />
              <TextField control={form.control} name="phone" label="Phone" required inputMode="tel" />
              <TextField control={form.control} name="email" label="Email" optional type="email" />
              <SelectField
                control={form.control}
                name="roleTitle"
                label="Role"
                options={STAFF_ROLE_TITLES.filter((r) => r !== "Owner" || session.isOwner || value?.roleTitle === "Owner").map((r) => ({ value: r, label: r }))}
              />
              <TextField control={form.control} name="employeeCode" label="Employee ID" required />
              <SelectField control={form.control} name="status" label="Status" options={Object.entries(STAFF_STATUS).map(([v, s]) => ({ value: v, label: s.label }))} />
              <TextField control={form.control} name="joiningDate" label="Joining date" required type="date" />
              <TextField control={form.control} name="salary" label="Monthly salary" required prefix="₹" inputMode="decimal" />
              <TextField control={form.control} name="emergencyContact" label="Emergency contact" optional />
            </div>
            <TextareaField control={form.control} name="address" label="Address" optional className="[&_textarea]:min-h-[56px]" />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={form.formState.isSubmitting}>{value ? "Save changes" : "Add to team"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function LoginAccessDialog({ open, onOpenChange, staff, roles }: { open: boolean; onOpenChange: (o: boolean) => void; staff: StaffRow | null; roles: { id: string; name: string; isOwner: boolean }[] }) {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [roleId, setRoleId] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});
  React.useEffect(() => {
    if (open && staff) {
      setEmail(staff.email ?? "");
      setPassword("");
      setErrors({});
      setRoleId(roles.find((r) => r.name.toLowerCase().includes(staff.roleTitle.toLowerCase().split(" ")[0]!))?.id ?? roles.find((r) => !r.isOwner)?.id ?? "");
    }
  }, [open, staff, roles]);
  const run = useAction(giveLoginAccessAction, { success: "Login created", quietErrors: false, onError: (r) => setErrors(r.fieldErrors ?? {}), onSuccess: () => onOpenChange(false) });
  if (!staff) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`Give ${staff.name} a login`} description="They'll sign in at /auth/login with these details. Permissions follow the role." size="sm">
        <DialogBody className="space-y-4">
          <Field label="Login email" required error={errors.email}>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Temporary password" required error={errors.password} description="Share it privately; they can change it in My profile.">
            <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters with a number" />
          </Field>
          <Field label="Role" required error={errors.roleId}>
            <NativeSelect value={roleId} onChange={(e) => setRoleId(e.target.value)}>
              {roles.filter((r) => !r.isOwner).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={run.pending} onClick={() => run.execute({ staffId: staff.id, email, password, roleId })}>Create login</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function StaffTable({
  rows,
  total,
  page,
  pageSize,
  roles,
  nextCode,
}: {
  rows: StaffRow[];
  total: number;
  page: number;
  pageSize: number;
  roles: { id: string; name: string; isOwner: boolean }[];
  nextCode: string;
}) {
  const session = useSession();
  const router = useRouter();
  const [dialog, setDialog] = React.useState<{ kind: "edit" | "login" | "delete" | "new"; row: StaffRow | null } | null>(null);
  const del = useAction(deleteStaffAction, { success: "Removed from team", onSuccess: () => setDialog(null) });
  const showSalary = session.can("staff.edit");
  const columns: Column<StaffRow>[] = [
    {
      key: "name",
      header: "Name",
      sortable: true,
      cell: (r) => (
        <div className="flex items-center gap-3">
          <Avatar name={r.name} size="sm" />
          <div>
            <p className="font-medium text-ink">{r.name}</p>
            <p className="text-xs text-muted">{r.employeeCode} · {formatPhone(r.phone)}</p>
          </div>
        </div>
      ),
    },
    { key: "role", header: "Role", cell: (r) => r.roleTitle },
    { key: "status", header: "Status", cell: (r) => <StatusBadge dict={STAFF_STATUS} value={r.status} /> },
    { key: "today", header: "Today", hideBelow: "md", cell: (r) => (r.today ? <StatusBadge dict={ATTENDANCE_STATUS} value={r.today.status} size="sm" /> : <span className="text-xs text-subtle">Not marked</span>) },
    { key: "joiningDate", header: "Joined", sortable: true, hideBelow: "lg", cell: (r) => formatDate(r.joiningDate, "UTC") },
    ...(showSalary ? [{ key: "salary", header: "Salary", align: "right" as const, sortable: true, hideBelow: "lg" as const, cell: (r: StaffRow) => (r.salary ? formatMoney(r.salary) : <span className="text-subtle">—</span>) }] : []),
    {
      key: "login",
      header: "POS login",
      cell: (r) =>
        r.login ? (
          <Badge tone={r.login.status === "ACTIVE" ? "brand" : "danger"} size="sm">
            {r.login.role}
          </Badge>
        ) : (
          <span className="text-xs text-subtle">No login</span>
        ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (r) => (
        <div onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label={`${r.name} actions`}>
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[200px]">
              <DropdownMenuItem onSelect={() => router.push(`/app/staff/${r.id}/attendance`)}>
                <CalendarDays /> View attendance
              </DropdownMenuItem>
              {session.can("staff.edit") && (session.isOwner || !r.login?.isOwner) ? (
                <DropdownMenuItem onSelect={() => setDialog({ kind: "edit", row: r })}>
                  <Pencil /> Edit details
                </DropdownMenuItem>
              ) : null}
              {session.can("staff.edit") && !r.login ? (
                <DropdownMenuItem onSelect={() => setDialog({ kind: "login", row: r })}>
                  <KeyRound /> Give POS login
                </DropdownMenuItem>
              ) : null}
              {r.login && session.can("settings.edit") ? (
                <DropdownMenuItem onSelect={() => router.push("/app/settings/users")}>
                  <KeyRound /> Manage access
                </DropdownMenuItem>
              ) : null}
              {session.can("staff.delete") ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem tone="danger" disabled={!!r.login} onSelect={() => setDialog({ kind: "delete", row: r })}>
                    <Trash /> Remove from team
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];
  return (
    <>
      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        onRowClick={(r) => router.push(`/app/staff/${r.id}`)}
        empty={<EmptyState icon={<IdCard />} title="No team members yet" description="Add your chefs, servers and cashiers to track attendance and shifts." />}
      />
      <Pagination page={page} pageSize={pageSize} total={total} />
      <StaffDialog open={dialog?.kind === "edit" || dialog?.kind === "new"} onOpenChange={(o) => !o && setDialog(null)} value={dialog?.kind === "edit" ? dialog.row : null} nextCode={nextCode} />
      <LoginAccessDialog open={dialog?.kind === "login"} onOpenChange={(o) => !o && setDialog(null)} staff={dialog?.row ?? null} roles={roles} />
      <ConfirmDialog
        open={dialog?.kind === "delete"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Remove ${dialog?.row?.name}?`}
        description="Their attendance and shift history will be deleted too."
        confirmLabel="Remove"
        loading={del.pending}
        onConfirm={() => del.execute({ id: dialog!.row!.id })}
      />
    </>
  );
}

export function AddStaffButton({ nextCode }: { nextCode: string }) {
  const session = useSession();
  const [open, setOpen] = React.useState(false);
  if (!session.can("staff.create")) return null;
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus /> Add team member
      </Button>
      <StaffDialog open={open} onOpenChange={setOpen} value={null} nextCode={nextCode} />
    </>
  );
}
