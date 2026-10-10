"use client";

import { ChevronLeft, ChevronRight, Plus, Trash } from "lucide-react";
import * as React from "react";
import { SelectField, TextField, useFormSubmit, useZodForm } from "@/components/forms/fields";
import { useSession } from "@/components/shell/session-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/display";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/overlay";
import { useAction } from "@/hooks/use-action";
import { useQueryParams } from "@/hooks/use-query-params";
import { cn, pluralize } from "@/lib/utils";
import { shiftSchema } from "@/lib/validation/team";
import { deleteShiftAction, saveShiftAction } from "@/server/actions/staff";

export interface PlannerShift {
  id: string;
  staffId: string;
  date: string;
  startTime: string;
  endTime: string;
  station: string | null;
}

export function ShiftPlanner({
  weekStart,
  staff,
  shifts,
  stations,
  today,
}: {
  weekStart: string;
  staff: { id: string; name: string; roleTitle: string }[];
  shifts: PlannerShift[];
  stations: string[];
  today: string;
}) {
  const session = useSession();
  const { set } = useQueryParams();
  const canEdit = session.can("staff.edit");
  const [editing, setEditing] = React.useState<(Partial<PlannerShift> & { staffId: string; date: string }) | null>(null);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${weekStart}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
  const move = (n: number) => {
    const d = new Date(`${weekStart}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n * 7);
    set({ week: d.toISOString().slice(0, 10) });
  };
  const hours = (s: PlannerShift) => {
    const [a, b] = [s.startTime, s.endTime].map((t) => Number(t.slice(0, 2)) + Number(t.slice(3)) / 60) as [number, number];
    return b > a ? b - a : 24 - a + b;
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <Button variant="outline" size="icon-sm" aria-label="Previous week" onClick={() => move(-1)}>
          <ChevronLeft />
        </Button>
        <p className="min-w-[200px] text-center text-[13px] font-semibold text-ink">
          {new Date(`${days[0]}T12:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" })} –{" "}
          {new Date(`${days[6]}T12:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}
        </p>
        <Button variant="outline" size="icon-sm" aria-label="Next week" onClick={() => move(1)}>
          <ChevronRight />
        </Button>
        <span className="ml-auto text-xs text-muted">{pluralize(shifts.length, "shift")} · {pluralize(Math.round(shifts.reduce((s, x) => s + hours(x), 0)), "scheduled hour")}</span>
      </div>
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[920px] table-fixed border-collapse text-[13px]">
          <thead>
            <tr>
              <th className="w-[180px] border-b border-line bg-canvas/70 px-4 py-2 text-left text-xs font-medium text-muted">Team member</th>
              {days.map((d) => (
                <th key={d} className={cn("border-b border-l border-line bg-canvas/70 px-2 py-2 text-left text-xs font-medium", d === today ? "text-brand-600" : "text-muted")}>
                  {new Date(`${d}T12:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", timeZone: "UTC" })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id}>
                <td className="border-b border-line px-4 py-2">
                  <p className="font-medium text-ink">{s.name}</p>
                  <p className="text-xs text-muted">{s.roleTitle}</p>
                </td>
                {days.map((d) => {
                  const mine = shifts.filter((x) => x.staffId === s.id && x.date === d);
                  return (
                    <td key={d} className={cn("group border-b border-l border-line p-1.5 align-top", d === today && "bg-brand-50/50")}>
                      <div className="flex min-h-[44px] flex-col gap-1">
                        {mine.map((x) => (
                          <button suppressHydrationWarning
                            key={x.id}
                            type="button"
                            disabled={!canEdit}
                            onClick={() => setEditing({ ...x })}
                            className="rounded-md bg-brand-100 px-2 py-1 text-left text-2xs text-brand-700 hover:bg-brand-150"
                          >
                            <span className="block font-semibold">{x.startTime}–{x.endTime}</span>
                            {x.station ? <span className="block opacity-80">{x.station}</span> : null}
                          </button>
                        ))}
                        {canEdit ? (
                          <button suppressHydrationWarning
                            type="button"
                            onClick={() => setEditing({ staffId: s.id, date: d, startTime: "10:00", endTime: "18:00" })}
                            className="hidden h-6 items-center justify-center rounded-md border border-dashed border-line-strong text-subtle group-hover:flex hover:border-brand-300 hover:text-brand-500"
                            aria-label={`Add shift for ${s.name}`}
                          >
                            <Plus className="size-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ShiftDialog value={editing} onClose={() => setEditing(null)} staff={staff} stations={stations} />
    </Card>
  );
}

function ShiftDialog({
  value,
  onClose,
  staff,
  stations,
}: {
  value: (Partial<PlannerShift> & { staffId: string; date: string }) | null;
  onClose: () => void;
  staff: { id: string; name: string }[];
  stations: string[];
}) {
  const form = useZodForm(shiftSchema, { staffId: "", date: "", startTime: "10:00", endTime: "18:00", station: "", notes: "" });
  React.useEffect(() => {
    if (value) form.reset({ id: value.id, staffId: value.staffId, date: value.date, startTime: value.startTime ?? "10:00", endTime: value.endTime ?? "18:00", station: value.station ?? "", notes: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const submit = useFormSubmit(form, saveShiftAction, { success: "Shift saved", onSuccess: onClose });
  const del = useAction(deleteShiftAction, { success: "Shift removed", onSuccess: onClose });
  return (
    <Dialog open={!!value} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={value?.id ? "Edit shift" : "Add shift"} size="sm">
        <form onSubmit={submit} noValidate className="contents">
          <DialogBody className="space-y-4">
            <SelectField control={form.control} name="staffId" label="Team member" options={staff.map((s) => ({ value: s.id, label: s.name }))} />
            <TextField control={form.control} name="date" label="Date" type="date" required />
            <div className="grid grid-cols-2 gap-3">
              <TextField control={form.control} name="startTime" label="Start" type="time" required />
              <TextField control={form.control} name="endTime" label="End" type="time" required />
            </div>
            <SelectField control={form.control} name="station" label="Station" placeholder="Floor" options={[...stations, "Floor", "Counter"].map((s) => ({ value: s, label: s }))} />
          </DialogBody>
          <DialogFooter>
            {value?.id ? (
              <Button variant="ghost" className="mr-auto text-danger-700" loading={del.pending} onClick={() => del.execute({ id: value.id! })}>
                <Trash /> Remove
              </Button>
            ) : null}
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={form.formState.isSubmitting}>Save shift</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
