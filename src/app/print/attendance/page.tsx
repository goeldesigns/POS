import type { Metadata } from "next";
import { AutoPrint } from "@/components/print/auto-print";
import { formatDateTime } from "@/lib/format";
import { requirePagePermission } from "@/server/auth/guards";
import type { SearchParams } from "@/server/list-params";
import { attendancePeriod, teamAttendanceSheet } from "@/server/services/attendance-reports";

export const metadata: Metadata = { title: "Attendance sheet" };

const CODE: Record<string, { code: string; fill: string }> = {
  PRESENT: { code: "P", fill: "#e7f6ee" },
  LATE: { code: "L", fill: "#fff3dc" },
  HALF_DAY: { code: "½", fill: "#e6effd" },
  LEAVE: { code: "LV", fill: "#eeeef1" },
  ABSENT: { code: "A", fill: "#fde8e8" },
};

/** A4 landscape monthly register: everyone × every day. */
export default async function PrintAttendanceSheet({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePagePermission("staff.view");
  const tz = ctx.restaurant.timezone;
  const sheet = await teamAttendanceSheet(ctx, attendancePeriod(await searchParams, tz), tz);

  return (
    <>
      <style>{`@media print { @page { size: A4 landscape; margin: 8mm; } } .fill { print-color-adjust: exact; -webkit-print-color-adjust: exact; }`}</style>
      <AutoPrint />
      <article className="mx-auto max-w-[1180px] bg-white p-6 text-[10px] text-black shadow-card print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-end justify-between border-b-2 border-black pb-2">
          <div>
            <p className="text-[9px] tracking-widest text-neutral-500 uppercase">{ctx.restaurant.name}</p>
            <h1 className="text-lg font-bold">Attendance sheet · {sheet.period.label}</h1>
          </div>
          <p className="text-right text-neutral-600">
            Generated {formatDateTime(new Date(), tz)} by {ctx.user.name}
          </p>
        </header>

        <table className="mt-3 w-full border-collapse">
          <thead>
            <tr>
              <th className="border border-neutral-300 px-1.5 py-1 text-left font-semibold">Team member</th>
              {sheet.dates.map((d) => (
                <th key={d.date} className="w-[22px] border border-neutral-300 px-0 py-0.5 text-center font-semibold">
                  <span className="block text-[8px] font-normal text-neutral-500">{d.weekday}</span>
                  {d.day}
                </th>
              ))}
              {["P", "L", "½", "LV", "A", "Payable"].map((h) => (
                <th key={h} className="border border-neutral-300 bg-neutral-50 px-1 py-1 text-center font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((r) => (
              <tr key={r.id} className="break-inside-avoid">
                <td className="border border-neutral-300 px-1.5 py-1 whitespace-nowrap">
                  <span className="font-semibold">{r.name}</span>
                  <span className="block text-[8.5px] text-neutral-500">
                    {r.employeeCode} · {r.roleTitle}
                  </span>
                </td>
                {r.cells.map((c) => {
                  const s = c.status ? CODE[c.status] : null;
                  return (
                    <td
                      key={c.date}
                      className="fill border border-neutral-300 px-0 py-1 text-center font-semibold"
                      style={s ? { background: s.fill } : c.state === "unmarked" ? { color: "#b45309" } : { color: "#c4c4c4" }}
                    >
                      {s ? s.code : c.state === "unmarked" ? "?" : ""}
                    </td>
                  );
                })}
                {[r.totals.PRESENT, r.totals.LATE, r.totals.HALF_DAY, r.totals.LEAVE, r.totals.ABSENT, r.totals.payableDays].map((v, i) => (
                  <td key={i} className="border border-neutral-300 bg-neutral-50 px-1 py-1 text-center font-semibold tabular-nums">
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <p className="mt-3 text-[9px] text-neutral-600">
          P Present · L Late · ½ Half day · LV Leave · A Absent · ? Not marked · Payable days count half days as ½
          {sheet.truncated ? " · Showing the first 31 days of the range" : ""}
        </p>
        <footer className="mt-4 border-t border-neutral-300 pt-2 text-[9px] text-neutral-500">Tabla POS · {ctx.restaurant.name} · Confidential</footer>
      </article>
    </>
  );
}
