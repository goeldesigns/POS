import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AutoPrint } from "@/components/print/auto-print";
import { formatDate, formatDateTime } from "@/lib/format";
import { ATTENDANCE_STATUS } from "@/lib/labels";
import { requirePagePermission } from "@/server/auth/guards";
import type { SearchParams } from "@/server/list-params";
import { attendancePeriod, staffAttendanceReport } from "@/server/services/attendance-reports";

export const metadata: Metadata = { title: "Attendance statement" };

/** Light fills that survive printing (print-color-adjust: exact). */
const FILL: Record<string, string> = {
  PRESENT: "#e7f6ee",
  LATE: "#fff3dc",
  HALF_DAY: "#e6effd",
  LEAVE: "#eeeef1",
  ABSENT: "#fde8e8",
};

function hours(h: number | null) {
  if (h == null) return "—";
  const m = Math.round(h * 60);
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

/** A4 attendance statement for one person — "Save as PDF" in the print dialog downloads it. */
export default async function PrintStaffAttendance({ params, searchParams }: { params: Promise<{ staffId: string }>; searchParams: Promise<SearchParams> }) {
  const ctx = await requirePagePermission("staff.view");
  const { staffId } = await params;
  const tz = ctx.restaurant.timezone;
  const period = attendancePeriod(await searchParams, tz);
  const report = await staffAttendanceReport(ctx, staffId, period, tz).catch(() => null);
  if (!report) notFound();
  const { staff, days, totals } = report;
  const day = (d: string) => formatDate(`${d}T12:00:00Z`, "UTC");

  return (
    <>
      <style>{`@media print { @page { size: A4 portrait; margin: 12mm; } } .fill { print-color-adjust: exact; -webkit-print-color-adjust: exact; }`}</style>
      <AutoPrint />
      <article className="mx-auto max-w-[820px] bg-white p-8 text-[11px] text-black shadow-card print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-end justify-between border-b-2 border-black pb-3">
          <div>
            <p className="text-[10px] tracking-widest text-neutral-500 uppercase">{ctx.restaurant.name}</p>
            <h1 className="text-xl font-bold">Attendance statement</h1>
            <p className="text-neutral-600">{period.label}</p>
          </div>
          <div className="text-right text-neutral-600">
            <p>Generated {formatDateTime(new Date(), tz)}</p>
            <p>by {ctx.user.name}</p>
          </div>
        </header>

        <section className="mt-4 grid grid-cols-4 gap-3 rounded border border-neutral-300 p-3">
          {[
            ["Name", staff.name],
            ["Employee ID", staff.employeeCode],
            ["Role", staff.roleTitle],
            ["Joined", day(staff.joiningDate)],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="text-neutral-500">{label}</p>
              <p className="text-[12px] font-semibold">{value}</p>
            </div>
          ))}
        </section>

        <section className="my-4 grid grid-cols-8 gap-2">
          {[
            ["Present", totals.PRESENT],
            ["Late", totals.LATE],
            ["Half day", totals.HALF_DAY],
            ["Leave", totals.LEAVE],
            ["Absent", totals.ABSENT],
            ["Not marked", totals.unmarked],
            ["Hours", hours(totals.hours)],
            ["Payable days", totals.payableDays],
          ].map(([label, value]) => (
            <div key={label} className="rounded border border-neutral-300 p-2">
              <p className="text-neutral-500">{label}</p>
              <p className="text-[14px] font-bold">{value}</p>
            </div>
          ))}
        </section>

        <table className="w-full border-collapse">
          <thead>
            <tr>
              {["Date", "Day", "Status", "In", "Out", "Hours", "Shift", "Notes"].map((h) => (
                <th key={h} className={`border-b border-black px-1.5 py-1 font-semibold ${h === "Hours" ? "text-right" : "text-left"}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.date} className="break-inside-avoid border-b border-neutral-200">
                <td className="px-1.5 py-1 whitespace-nowrap">{day(d.date)}</td>
                <td className="px-1.5 py-1 text-neutral-600">{d.weekday}</td>
                <td className="px-1.5 py-1">
                  {d.status ? (
                    <span className="fill rounded px-1.5 py-0.5 font-semibold" style={{ background: FILL[d.status] }}>
                      {ATTENDANCE_STATUS[d.status]!.label}
                    </span>
                  ) : d.state === "unmarked" ? (
                    <span className="text-neutral-500 italic">Not marked</span>
                  ) : d.state === "before-joining" ? (
                    <span className="text-neutral-400">Not joined</span>
                  ) : (
                    <span className="text-neutral-400">—</span>
                  )}
                </td>
                <td className="px-1.5 py-1 tabular-nums">{d.clockIn ?? "—"}</td>
                <td className="px-1.5 py-1 tabular-nums">{d.clockOut ?? "—"}</td>
                <td className="px-1.5 py-1 text-right tabular-nums">{hours(d.hours)}</td>
                <td className="px-1.5 py-1 text-neutral-600">{d.shift ?? "—"}</td>
                <td className="px-1.5 py-1 text-neutral-600">{d.notes ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="mt-10 grid grid-cols-2 gap-16 break-inside-avoid">
          {["Employee signature", "Manager signature"].map((s) => (
            <div key={s}>
              <div className="h-10 border-b border-black" />
              <p className="mt-1 text-neutral-600">{s}</p>
            </div>
          ))}
        </section>
        <footer className="mt-6 border-t border-neutral-300 pt-2 text-[9px] text-neutral-500">
          Tabla POS · {ctx.restaurant.name} · Attendance rate {totals.rate == null ? "—" : `${totals.rate}%`} · Payable days count half days as ½
        </footer>
      </article>
    </>
  );
}
