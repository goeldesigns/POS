import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Page } from "@/components/shell/page";
import { Avatar, Badge, Card, CardBody, CardHeader, DetailList, EmptyState, StatusBadge } from "@/components/ui/display";
import { PageHeader } from "@/components/ui/page-header";
import { formatDate, formatDateTime, formatMoney, formatPhone } from "@/lib/format";
import { ATTENDANCE_STATUS, STAFF_STATUS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { requirePagePermission } from "@/server/auth/guards";
import { staffActivity, toDbDate } from "@/server/services/staff";
import { zonedParts } from "@/server/time";

export const metadata: Metadata = { title: "Team member" };

const DOT: Record<string, string> = { PRESENT: "bg-success", LATE: "bg-warning", HALF_DAY: "bg-info", LEAVE: "bg-ink-2", ABSENT: "bg-danger" };

export default async function StaffProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePagePermission("staff.view");
  const { id } = await params;
  const tz = ctx.restaurant.timezone;
  const today = zonedParts(new Date(), tz).ymd;
  const from = new Date(`${today}T12:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 29);
  const s = await ctx.db.staffMember.findUnique({
    where: { id },
    include: {
      restaurantUser: { include: { role: { select: { name: true } }, user: { select: { id: true, email: true, lastLoginAt: true } } } },
      attendance: { where: { date: { gte: toDbDate(from) } }, orderBy: { date: "asc" } },
      shifts: { where: { date: { gte: toDbDate(today) } }, orderBy: [{ date: "asc" }, { startTime: "asc" }], take: 14 },
    },
  });
  if (!s) notFound();
  const activity = s.restaurantUser ? await staffActivity(ctx, { userId: s.restaurantUser.user.id, take: 30 }) : [];
  const att = new Map(s.attendance.map((a) => [a.date.toISOString().slice(0, 10), a.status]));
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(from);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
  const present = s.attendance.filter((a) => a.status === "PRESENT" || a.status === "LATE").length;

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Staff", href: "/app/staff" }, { label: s.name }]}
        title={
          <span className="flex items-center gap-3">
            <Avatar name={s.name} size="lg" />
            <span>
              {s.name}
              <span className="mt-1 flex items-center gap-2 text-xs font-normal text-muted">
                {s.roleTitle} · {s.employeeCode} <StatusBadge dict={STAFF_STATUS} value={s.status} size="sm" />
              </span>
            </span>
          </span>
        }
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <DetailList
                items={[
                  { label: "Phone", value: formatPhone(s.phone) },
                  { label: "Email", value: s.email ?? "—" },
                  { label: "Joined", value: formatDate(s.joiningDate, "UTC") },
                  { label: "Monthly salary", value: ctx.permissions.has("staff.edit") ? formatMoney(s.salary) : "Hidden" },
                  { label: "Emergency contact", value: s.emergencyContact ?? "—" },
                  { label: "Address", value: s.address ?? "—" },
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader
              title="Attendance · last 30 days"
              description={`${present} days present`}
              actions={
                <Link href={`/app/staff/${s.id}/attendance`} className="text-xs font-medium text-brand-500 hover:text-brand-600">
                  Full attendance & PDF →
                </Link>
              }
            />
            <CardBody>
              <div className="grid grid-cols-10 gap-1.5 sm:grid-cols-15">
                {days.map((d) => {
                  const st = att.get(d);
                  return (
                    <div key={d} title={`${d}: ${st ? ATTENDANCE_STATUS[st]!.label : "Not marked"}`} className="flex flex-col items-center gap-1">
                      <span className={cn("size-6 rounded-md", st ? DOT[st] : "bg-sunken")} />
                      <span className="text-[9px] text-subtle">{Number(d.slice(8))}</span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
                {Object.entries(ATTENDANCE_STATUS).map(([k, v]) => (
                  <span key={k} className="inline-flex items-center gap-1.5">
                    <span className={cn("size-2.5 rounded-sm", DOT[k])} /> {v.label}
                  </span>
                ))}
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Recent activity" description={s.restaurantUser ? "Actions taken with their POS login" : "No POS login"} />
            <CardBody>
              {activity.length ? (
                <ul className="space-y-2.5">
                  {activity.map((a) => (
                    <li key={a.id} className="text-[13px]">
                      <p className="text-ink">{a.summary}</p>
                      <p className="text-xs text-muted">{formatDateTime(a.createdAt, tz)}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState compact title="No activity recorded" />
              )}
            </CardBody>
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader title="POS login" />
            <CardBody className="text-[13px]">
              {s.restaurantUser ? (
                <div className="space-y-1.5">
                  <p><Badge tone="brand">{s.restaurantUser.role.name}</Badge> <Badge tone={s.restaurantUser.status === "ACTIVE" ? "success" : "danger"}>{s.restaurantUser.status.toLowerCase()}</Badge></p>
                  <p className="text-ink">{s.restaurantUser.user.email}</p>
                  <p className="text-xs text-muted">Last sign-in: {s.restaurantUser.user.lastLoginAt ? formatDateTime(s.restaurantUser.user.lastLoginAt, tz) : "never"}</p>
                  {ctx.permissions.has("settings.edit") ? (
                    <Link href="/app/settings/users" className="text-xs font-medium text-brand-500">Manage role & permissions →</Link>
                  ) : null}
                </div>
              ) : (
                <p className="text-muted">No login. Give access from the Team tab menu.</p>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Upcoming shifts" />
            <CardBody>
              {s.shifts.length ? (
                <ul className="space-y-2">
                  {s.shifts.map((sh) => (
                    <li key={sh.id} className="flex items-center justify-between rounded-lg bg-canvas px-3 py-2 text-[13px]">
                      <span className="font-medium text-ink">{formatDate(sh.date, "UTC")}</span>
                      <span className="text-muted">{sh.startTime}–{sh.endTime}{sh.station ? ` · ${sh.station}` : ""}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-muted">No shifts scheduled.</p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </Page>
  );
}
