import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { attendancePeriod, staffAttendanceReport, teamAttendanceSheet } from "@/server/services/attendance-reports";
import { tenantDb } from "@/server/tenant-db";
import { cleanup, ensureTestPlans, makeRestaurant, signIn } from "./helpers";

/** Attendance statements (per person, month or date range) and the team sheet behind the PDFs. */
describe("attendance reports", () => {
  let restaurantId: string;
  let owner: Awaited<ReturnType<typeof signIn>>["ctx"];
  let staffId: string;
  const tz = "Asia/Kolkata";

  beforeAll(async () => {
    await ensureTestPlans();
    const r = await makeRestaurant("Lima Lounge");
    restaurantId = r.restaurant.id;
    owner = (await signIn(r.owner.id, restaurantId)).ctx;
    const staff = await tenantDb(restaurantId).staffMember.create({
      data: { restaurantId, name: "Ritu Das", phone: "9800000011", roleTitle: "Waiter", employeeCode: "EMP-777", joiningDate: new Date("2026-03-05T00:00:00Z") },
    });
    staffId = staff.id;
    const day = (d: string) => new Date(`${d}T00:00:00Z`);
    await prisma.attendance.createMany({
      data: [
        // 09:00–17:30 IST
        { restaurantId, staffId, date: day("2026-03-05"), status: "PRESENT", clockIn: new Date("2026-03-05T03:30:00Z"), clockOut: new Date("2026-03-05T12:00:00Z") },
        // 09:00–13:00 IST
        { restaurantId, staffId, date: day("2026-03-06"), status: "HALF_DAY", clockIn: new Date("2026-03-06T03:30:00Z"), clockOut: new Date("2026-03-06T07:30:00Z") },
        // 22:00 → 02:00 IST, both stored against the 7th: the shift wraps past midnight.
        { restaurantId, staffId, date: day("2026-03-07"), status: "LATE", clockIn: new Date("2026-03-07T16:30:00Z"), clockOut: new Date("2026-03-06T20:30:00Z") },
        { restaurantId, staffId, date: day("2026-03-08"), status: "ABSENT" },
        { restaurantId, staffId, date: day("2026-03-09"), status: "LEAVE", notes: "Family function" },
      ],
    });
  });

  afterAll(cleanup);

  it("reads a month or a date range from the query", () => {
    expect(attendancePeriod({ month: "2026-02" }, tz)).toMatchObject({ mode: "month", from: "2026-02-01", to: "2026-02-28", label: "February 2026", query: "month=2026-02" });
    expect(attendancePeriod({ from: "2026-03-10", to: "2026-03-01" }, tz)).toMatchObject({ mode: "range", from: "2026-03-01", to: "2026-03-10" });
    // 366 days at most.
    expect(attendancePeriod({ from: "2025-01-01", to: "2027-06-30" }, tz).to).toBe("2026-01-01");
    expect(attendancePeriod({ month: "nonsense" }, tz).mode).toBe("month");
  });

  it("totals a month: payable days count half days as half, unmarked days only after joining", async () => {
    const report = await staffAttendanceReport(owner, staffId, attendancePeriod({ month: "2026-03" }, tz), tz);
    expect(report.days).toHaveLength(31);
    expect(report.days[0]!.state).toBe("before-joining");
    expect(report.days.find((d) => d.date === "2026-03-05")).toMatchObject({ status: "PRESENT", clockIn: "09:00", clockOut: "17:30", hours: 8.5 });
    expect(report.days.find((d) => d.date === "2026-03-07")!.hours).toBe(4);
    expect(report.days.find((d) => d.date === "2026-03-09")!.notes).toBe("Family function");
    expect(report.totals).toMatchObject({ PRESENT: 1, LATE: 1, HALF_DAY: 1, LEAVE: 1, ABSENT: 1, unmarked: 22, hours: 16.5, payableDays: 2.5, rate: 9.3 });
  });

  it("covers just the chosen dates in range mode", async () => {
    const report = await staffAttendanceReport(owner, staffId, attendancePeriod({ from: "2026-03-05", to: "2026-03-07" }, tz), tz);
    expect(report.days.map((d) => d.status)).toEqual(["PRESENT", "HALF_DAY", "LATE"]);
    expect(report.totals).toMatchObject({ payableDays: 2.5, unmarked: 0, rate: 83.3 });
  });

  it("builds the team sheet with a column per day", async () => {
    const sheet = await teamAttendanceSheet(owner, attendancePeriod({ month: "2026-03" }, tz), tz);
    expect(sheet.dates).toHaveLength(31);
    const row = sheet.rows.find((r) => r.id === staffId)!;
    expect(row.cells.find((c) => c.date === "2026-03-08")!.status).toBe("ABSENT");
    expect(row.totals.payableDays).toBe(2.5);
  });
});
