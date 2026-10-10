import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Server actions read the request (cookies, IP) through Next. Swap those for
// in-memory doubles; everything below them is the real code.
const jar = vi.hoisted(() => ({ cookies: new Map<string, string>(), admin: null as unknown }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.cookies.has(name) ? { name, value: jar.cookies.get(name) } : undefined),
    set: (name: string, value: string) => void jar.cookies.set(name, value),
    delete: (name: string) => void jar.cookies.delete(name),
  }),
  headers: async () => new Headers({ "x-forwarded-for": "127.0.0.1", "user-agent": "vitest" }),
}));
vi.mock("@/server/auth/context", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getRestaurantContext: async () => null,
  getPlatformContext: async () => jar.admin,
  getRequestMeta: async () => ({ ip: "127.0.0.1", userAgent: "vitest" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
  unstable_rethrow: () => {},
}));

import { DEMO, addDaysToDate, demoParts, weekdayOf } from "@/lib/demo";
import { loginAction } from "@/server/actions/auth";
import { requestDemoAction } from "@/server/actions/demo";
import { createRestaurantAction } from "@/server/actions/platform";
import { hashPassword } from "@/server/auth/password";
import { prisma } from "@/server/db";
import { BusinessRuleError, ConflictError } from "@/server/errors";
import { createDemoRequest, demoAvailability, setDemoStatus, updateDemoRequest } from "@/server/services/demos";
import { PASSWORD, RUN, addMember, cleanup, ensureTestPlans, makeRestaurant, trackRestaurant, trackUser } from "./helpers";

/** A bookable weekday a few days out, so lead time never interferes. */
function openDay(offset = 4): string {
  let date = addDaysToDate(demoParts(new Date()).date, offset);
  while (DEMO.closedWeekdays.includes(weekdayOf(date))) date = addDaysToDate(date, 1);
  return date;
}

const booking = (over: Partial<Parameters<typeof createDemoRequest>[0]> = {}) => ({
  date: openDay(),
  time: "15:30",
  name: "Meera Iyer",
  email: `meera.${RUN}@test.local`,
  phone: "+91 98450 11111",
  restaurantName: `Masala Junction ${RUN}`,
  city: "Chennai",
  outlets: 2,
  restaurantType: "Casual Dining",
  currentSystem: null,
  message: null,
  ...over,
});

const admin = { actor: { userId: null, name: "Test Admin", role: "Super Admin" } };

describe("demo booking", () => {
  beforeAll(ensureTestPlans);
  afterAll(async () => {
    const demos = await prisma.demoRequest.findMany({ where: { email: { contains: RUN } }, select: { id: true } });
    await prisma.auditLog.deleteMany({ where: { entity: "DemoRequest", entityId: { in: demos.map((d) => d.id) } } });
    await prisma.demoRequest.deleteMany({ where: { email: { contains: RUN } } });
    await cleanup();
  });

  it("offers Monday–Saturday slots in IST and closes Sundays", async () => {
    const days = await demoAvailability();
    expect(days).toHaveLength(DEMO.daysAhead + 1);
    const sunday = days.find((d) => weekdayOf(d.date) === 0)!;
    expect(sunday.slots).toEqual([]);
    const future = days.find((d) => d.date === openDay())!;
    expect(future.slots.map((s) => s.time)).toContain("10:00");
    expect(future.slots.map((s) => s.time)).toContain(DEMO.lastSlot);
  });

  it("stores the slot as the right instant (IST → UTC) and records who asked", async () => {
    const result = await createDemoRequest(booking(), { ip: "10.0.0.1", userAgent: "vitest" });
    const row = await prisma.demoRequest.findUniqueOrThrow({ where: { id: result.id } });
    expect(demoParts(row.scheduledAt)).toEqual({ date: openDay(), time: "15:30" });
    expect(row.scheduledAt.getUTCHours() * 60 + row.scheduledAt.getUTCMinutes()).toBe(10 * 60); // 15:30 IST = 10:00 UTC
    expect(row).toMatchObject({ status: "NEW", outlets: 2, ipAddress: "10.0.0.1" });
    const audit = await prisma.auditLog.findFirst({ where: { action: "demo.requested", entityId: row.id } });
    expect(audit).toMatchObject({ scope: "PLATFORM", actorRole: "Website visitor" });
  });

  it("refuses closed days, unlisted times, past slots and dates beyond the window", async () => {
    let sunday = addDaysToDate(demoParts(new Date()).date, 2);
    while (weekdayOf(sunday) !== 0) sunday = addDaysToDate(sunday, 1);
    await expect(createDemoRequest(booking({ date: sunday, email: `a.${RUN}@test.local` }))).rejects.toBeInstanceOf(BusinessRuleError);
    await expect(createDemoRequest(booking({ time: "15:45", email: `b.${RUN}@test.local` }))).rejects.toBeInstanceOf(BusinessRuleError);
    await expect(createDemoRequest(booking({ date: addDaysToDate(demoParts(new Date()).date, -1), email: `c.${RUN}@test.local` }))).rejects.toBeInstanceOf(
      BusinessRuleError,
    );
    await expect(createDemoRequest(booking({ date: openDay(DEMO.daysAhead + 3), email: `d.${RUN}@test.local` }))).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("holds each slot for at most the team's capacity", async () => {
    const date = openDay(6);
    for (let i = 0; i < DEMO.capacityPerSlot; i++) {
      await createDemoRequest(booking({ date, time: "11:00", email: `cap${i}.${RUN}@test.local` }));
    }
    await expect(createDemoRequest(booking({ date, time: "11:00", email: `cap-x.${RUN}@test.local` }))).rejects.toBeInstanceOf(ConflictError);
    const day = (await demoAvailability()).find((d) => d.date === date)!;
    expect(day.slots.find((s) => s.time === "11:00")?.remaining).toBe(0);
    expect(day.slots.find((s) => s.time === "11:30")?.remaining).toBe(DEMO.capacityPerSlot);
  });

  it("won't double-book the same person", async () => {
    await expect(createDemoRequest(booking({ time: "17:00" }))).rejects.toThrow(/already have a demo booked/);
  });

  it("validates on the server and quietly drops honeypot submissions", async () => {
    const bad = await requestDemoAction({ ...booking({ email: "not-an-email" }), outlets: "2" } as never);
    expect(bad).toMatchObject({ ok: false, code: "validation_error" });

    const before = await prisma.demoRequest.count();
    const bot = await requestDemoAction({ ...booking({ email: `bot.${RUN}@test.local` }), outlets: "1", website: "https://spam.example" } as never);
    expect(bot.ok).toBe(true);
    expect(await prisma.demoRequest.count()).toBe(before);
  });

  it("lets the console reschedule, confirm and assign — and keeps the timeline", async () => {
    const created = await createDemoRequest(booking({ email: `edit.${RUN}@test.local`, time: "12:00" }));
    const row = await prisma.demoRequest.findUniqueOrThrow({ where: { id: created.id } });
    await updateDemoRequest(admin, {
      ...booking({ email: row.email, time: "12:00" }),
      id: row.id,
      date: openDay(8),
      time: "19:30", // outside public hours: admins own the calendar
      durationMinutes: 45,
      status: "CONFIRMED",
      meetingLink: "https://meet.example.com/abc",
      adminNotes: "Wants KOT routing for tandoor",
      assignedToId: null,
      notifyCustomer: false,
    });
    const updated = await prisma.demoRequest.findUniqueOrThrow({ where: { id: row.id } });
    expect(demoParts(updated.scheduledAt)).toEqual({ date: openDay(8), time: "19:30" });
    expect(updated).toMatchObject({ status: "CONFIRMED", durationMinutes: 45, meetingLink: "https://meet.example.com/abc" });
    expect(updated.confirmedAt).not.toBeNull();
    expect(await prisma.auditLog.findFirst({ where: { action: "demo.rescheduled", entityId: row.id } })).not.toBeNull();

    await setDemoStatus(admin, row.id, "NO_SHOW");
    expect((await prisma.demoRequest.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("NO_SHOW");
  });

  it("turns a demo into a customer from the console", async () => {
    const adminUser = await prisma.user.create({
      data: { email: `admin.demo.${RUN}@test.local`, name: "Demo Admin", passwordHash: "x", platformRole: "SUPER_ADMIN" },
    });
    trackUser(adminUser.id);
    jar.admin = {
      kind: "platform",
      sessionId: "test",
      user: { id: adminUser.id, name: adminUser.name, email: adminUser.email, avatarUrl: null, platformRole: "SUPER_ADMIN" },
      actor: { userId: adminUser.id, name: adminUser.name, role: "Super Admin" },
    };
    const demo = await createDemoRequest(booking({ email: `convert.${RUN}@test.local`, time: "13:00" }));
    const result = await createRestaurantAction({
      name: `Converted Kitchen ${RUN}`,
      legalName: "",
      ownerName: "Meera Iyer",
      email: `convert.${RUN}@test.local`,
      phone: "+91 98450 11111",
      addressLine: "",
      city: "Chennai",
      state: "",
      country: "India",
      postalCode: "",
      gstNumber: "",
      fssaiNumber: "",
      currency: "INR",
      timezone: "Asia/Kolkata",
      restaurantType: "Casual Dining",
      numberOfTables: "4",
      taxRate: "5",
      taxInclusive: false,
      serviceChargePercent: "0",
      defaultOrderType: "DINE_IN",
      receiptHeader: "",
      receiptFooter: "",
      planKey: "test-full",
      modules: [],
      loginEmail: `convert.owner.${RUN}@test.local`,
      password: PASSWORD,
      confirmPassword: PASSWORD,
      demoRequestId: demo.id,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    trackRestaurant(result.data.id);
    trackUser((await prisma.user.findUniqueOrThrow({ where: { email: `convert.owner.${RUN}@test.local` } })).id);

    const linked = await prisma.demoRequest.findUniqueOrThrow({ where: { id: demo.id } });
    expect(linked).toMatchObject({ restaurantId: result.data.id, status: "COMPLETED" });
    expect(await prisma.auditLog.findFirst({ where: { action: "demo.converted", entityId: demo.id } })).not.toBeNull();
  });
});

describe("one sign-in for everyone", () => {
  let restaurantId: string;
  let cashierEmail: string;
  let adminEmail: string;

  beforeAll(async () => {
    await ensureTestPlans();
    const r = await makeRestaurant("Sign In Diner");
    restaurantId = r.restaurant.id;
    cashierEmail = (await addMember(restaurantId, "Cashier", "signin")).email;
    adminEmail = `admin.signin.${RUN}@test.local`;
    const adminUser = await prisma.user.create({
      data: { email: adminEmail, name: "Signin Admin", passwordHash: await hashPassword(PASSWORD), platformRole: "SUPER_ADMIN" },
    });
    trackUser(adminUser.id);
  });

  afterAll(cleanup);

  it("sends restaurant staff to their POS with a restaurant session", async () => {
    jar.cookies.clear();
    const result = await loginAction({ email: cashierEmail, password: PASSWORD, remember: true });
    expect(result).toMatchObject({ ok: true, data: { redirectTo: "/app" } });
    expect(jar.cookies.has("tabla_session")).toBe(true);
    expect(jar.cookies.has("tabla_admin_session")).toBe(false);
  });

  it("sends platform administrators to the console with a platform session", async () => {
    jar.cookies.clear();
    const result = await loginAction({ email: adminEmail, password: PASSWORD, remember: true, next: "/app/inventory" });
    expect(result).toMatchObject({ ok: true, data: { redirectTo: "/super-admin/dashboard" } });
    expect(jar.cookies.has("tabla_admin_session")).toBe(true);
    expect(jar.cookies.has("tabla_session")).toBe(false);
  });

  it("gives the same answer for a wrong password whoever you are", async () => {
    const a = await loginAction({ email: adminEmail, password: "Wrong@1234", remember: true });
    const b = await loginAction({ email: cashierEmail, password: "Wrong@1234", remember: true });
    const c = await loginAction({ email: `nobody.${RUN}@test.local`, password: "Wrong@1234", remember: true });
    expect(a).toMatchObject({ ok: false, code: "unauthorized" });
    expect(b.ok ? null : b.error).toBe(a.ok ? null : a.error);
    expect(c.ok ? null : c.error).toBe(a.ok ? null : a.error);
  });
});
