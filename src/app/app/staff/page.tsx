import type { Metadata } from "next";
import { AttendanceRegister } from "@/components/staff/attendance-register";
import { ShiftPlanner } from "@/components/staff/shift-planner";
import { AddStaffButton, StaffTable } from "@/components/staff/staff-team";
import { Page } from "@/components/shell/page";
import { Card, EmptyState } from "@/components/ui/display";
import { FilterSelect, SearchParamInput, TableCard } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { LinkTabs } from "@/components/ui/tabs";
import { formatDateTime, formatMoney } from "@/lib/format";
import { STAFF_STATUS } from "@/lib/labels";
import { requirePagePermission } from "@/server/auth/guards";
import { param, type SearchParams } from "@/server/list-params";
import { listRoles } from "@/server/services/members";
import { getAttendanceRegister, getShiftPlan, listStaff, nextEmployeeCode, staffActivity, staffPerformance, toDbDate } from "@/server/services/staff";
import { zonedParts } from "@/server/time";

export const metadata: Metadata = { title: "Staff" };

export default async function StaffPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePagePermission("staff.view");
  const sp = await searchParams;
  const tab = param(sp, "tab") ?? "team";
  const tz = ctx.restaurant.timezone;
  const today = zonedParts(new Date(), tz).ymd;
  const nextCode = await nextEmployeeCode(ctx);

  let body: React.ReactNode = null;
  if (tab === "attendance") {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(param(sp, "date") ?? "") ? param(sp, "date")! : today;
    const register = await getAttendanceRegister(ctx, date);
    body = <AttendanceRegister date={date} rows={register.rows} />;
  } else if (tab === "shifts") {
    const plan = await getShiftPlan(ctx, /^\d{4}-\d{2}-\d{2}$/.test(param(sp, "week") ?? "") ? param(sp, "week")! : today);
    body = <ShiftPlanner weekStart={plan.weekStart} today={today} staff={plan.staff} stations={plan.stations} shifts={plan.shifts} />;
  } else if (tab === "performance") {
    const preset = (["7d", "30d", "90d"] as const).find((p) => p === param(sp, "period")) ?? "30d";
    const rows = await staffPerformance(ctx, preset);
    body = (
      <TableCard toolbar={<FilterSelect param="period" allLabel="Last 30 days" options={[{ value: "7d", label: "Last 7 days" }, { value: "90d", label: "Last 3 months" }]} />}>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead>
                <tr className="bg-canvas/70 text-xs text-muted">
                  {["Team member", "Orders", "Sales", "Avg. order", "Discounts given", "Cancelled", "Refunds"].map((h, i) => (
                    <th key={h} className={`px-4 py-2.5 font-medium first:pl-5 ${i ? "text-right" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-line">
                    <td className="px-4 py-2.5 pl-5"><p className="font-medium text-ink">{r.name}</p><p className="text-xs text-muted">{r.roleTitle}</p></td>
                    <td className="tabular px-4 text-right">{r.orders}</td>
                    <td className="tabular px-4 text-right font-semibold">{formatMoney(r.sales)}</td>
                    <td className="tabular px-4 text-right">{formatMoney(r.aov)}</td>
                    <td className="tabular px-4 text-right">{formatMoney(r.discounts)}</td>
                    <td className="tabular px-4 text-right">{r.cancelled}</td>
                    <td className="tabular px-4 text-right">{formatMoney(r.refunds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No team members with POS logins" description="Performance is tracked for staff who take orders with their own login." />
        )}
      </TableCard>
    );
  } else if (tab === "activity") {
    const { members, entries: logs } = await staffActivity(ctx, { userId: param(sp, "user") });
    body = (
      <TableCard toolbar={<FilterSelect param="user" allLabel="Everyone" options={members.map((m) => ({ value: m.userId, label: m.name }))} className="w-[180px]" />}>
        {logs.length ? (
          <ul className="divide-y divide-line">
            {logs.map((l) => (
              <li key={l.id} className="flex items-start gap-3 px-5 py-2.5 text-[13px]">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-ink">{l.summary}</p>
                  <p className="text-xs text-muted">
                    {formatDateTime(l.createdAt, tz)} · {l.actorRole ?? "—"} · <span className="font-mono">{l.action}</span>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No activity yet" />
        )}
      </TableCard>
    );
  } else {
    const [data, roles] = await Promise.all([listStaff(ctx, sp, toDbDate(today)), listRoles(ctx)]);
    body = (
      <TableCard
        toolbar={
          <>
            <SearchParamInput placeholder="Search name, ID or phone" />
            <FilterSelect param="role" allLabel="All roles" options={data.roles.map((r) => ({ value: r, label: r }))} />
            <FilterSelect param="status" allLabel="Any status" options={Object.entries(STAFF_STATUS).map(([v, s]) => ({ value: v, label: s.label }))} className="w-[140px]" />
          </>
        }
      >
        <StaffTable rows={data.rows} total={data.total} page={data.params.page} pageSize={data.params.pageSize} roles={roles.map((r) => ({ id: r.id, name: r.name, isOwner: r.isOwner }))} nextCode={nextCode} />
      </TableCard>
    );
  }

  return (
    <Page>
      <PageHeader title="Staff" description="Team records, attendance, shifts and performance." actions={<AddStaffButton nextCode={nextCode} />} />
      <LinkTabs
        className="mb-4"
        defaultValue="team"
        items={[
          { value: "team", label: "Team" },
          { value: "attendance", label: "Attendance" },
          { value: "shifts", label: "Shifts" },
          { value: "performance", label: "Performance" },
          { value: "activity", label: "Activity log" },
        ]}
      />
      {body ?? <Card />}
    </Page>
  );
}
