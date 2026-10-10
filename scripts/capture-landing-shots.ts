/**
 * Capture real product screenshots for the landing page → public/landing/*.webp
 *
 * Drives a local Chrome/Edge in headless mode over the DevTools protocol (no
 * extra dependencies) against the running dev server, signed in as the demo
 * owner with a short-lived session that is revoked afterwards. Uses a fresh,
 * temporary browser profile — never your own.
 *
 *   npm run dev                                 # in another terminal
 *   npx tsx scripts/capture-landing-shots.ts
 *
 * Env: SHOT_BASE_URL (default http://localhost:3000), CHROME_PATH (optional).
 */
import "dotenv/config";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createSession, revokeSession } from "../src/server/auth/session";
import { prisma } from "../src/server/db";

const BASE = process.env.SHOT_BASE_URL ?? "http://localhost:3000";
const OUT = path.resolve("public/landing");
const OWNER_EMAIL = "owner@spiceandstone.demo";

const BROWSER_PATHS = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter((p): p is string => !!p);

interface Shot {
  name: string;
  path: string;
  width?: number;
  height?: number;
  scale?: number;
  mobile?: boolean;
  /** Extra settle time for charts and images. */
  wait?: number;
  /**
   * Pin the browser clock to shortly after the seeded service began, so live
   * timers ("12m" since the KOT) read naturally however old the demo data is.
   */
  serviceClock?: boolean;
}

type Message = { id?: number; method?: string; params?: Record<string, unknown>; result?: unknown; error?: { message: string }; sessionId?: string };

class Cdp {
  private seq = 0;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private listeners = new Set<(m: Message) => void>();

  constructor(private ws: WebSocket) {
    ws.onmessage = (event) => {
      const msg = JSON.parse(String(event.data)) as Message;
      if (msg.id != null && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id)!;
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message));
        else p.resolve(msg.result);
        return;
      }
      for (const l of this.listeners) l(msg);
    };
  }

  send<T = Record<string, unknown>>(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<T> {
    const id = ++this.seq;
    this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise<T>((resolve, reject) => this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject }));
  }

  waitFor(method: string, sessionId: string, timeoutMs = 30_000): Promise<Message> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.listeners.delete(listener);
        reject(new Error(`Timed out waiting for ${method}`));
      }, timeoutMs);
      const listener = (m: Message) => {
        if (m.method === method && m.sessionId === sessionId) {
          clearTimeout(timer);
          this.listeners.delete(listener);
          resolve(m);
        }
      };
      this.listeners.add(listener);
    });
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function launchBrowser() {
  const exe = BROWSER_PATHS.find((p) => existsSync(p));
  if (!exe) throw new Error("No Chrome or Edge found. Set CHROME_PATH.");
  const profile = mkdtempSync(path.join(tmpdir(), "tabla-shots-"));
  const child = spawn(exe, [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    "--mute-audio",
    "--force-color-profile=srgb",
    "about:blank",
  ]);
  const wsUrl = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Browser did not start")), 20_000);
    child.stderr.on("data", (chunk: Buffer) => {
      const match = /DevTools listening on (ws:\/\/\S+)/.exec(chunk.toString());
      if (match) {
        clearTimeout(timer);
        resolve(match[1]!);
      }
    });
    child.on("exit", (code) => reject(new Error(`Browser exited (${code})`)));
  });
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  return {
    cdp: new Cdp(ws),
    close: async () => {
      ws.close();
      child.kill();
      await sleep(500);
      rmSync(profile, { recursive: true, force: true });
    },
  };
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  const owner = await prisma.user.findUniqueOrThrow({
    where: { email: OWNER_EMAIL },
    include: { memberships: { include: { restaurant: true } } },
  });
  const restaurantId = owner.memberships[0]!.restaurantId;
  const openOrder = await prisma.order.findFirst({
    where: { restaurantId, type: "DINE_IN", status: { in: ["NEW", "PREPARING"] } },
    orderBy: { items: { _count: "desc" } },
    select: { id: true },
  });
  const latestOpen = await prisma.order.findFirst({
    where: { restaurantId, status: { in: ["NEW", "PREPARING", "READY"] }, placedAt: { not: null } },
    orderBy: { placedAt: "desc" },
    select: { placedAt: true },
  });
  const serviceNow = (latestOpen?.placedAt?.getTime() ?? Date.now()) + 38 * 60_000;

  const shots: Shot[] = [
    { name: "pos", path: openOrder ? `/app/pos?order=${openOrder.id}` : "/app/pos" },
    { name: "overview", path: "/app/overview?period=month", wait: 3000 },
    { name: "kitchen", path: "/app/orders?view=board", serviceClock: true },
    { name: "tables", path: "/app/tables", serviceClock: true },
    { name: "recipes", path: "/app/recipes" },
    { name: "inventory", path: "/app/inventory", wait: 3000 },
    { name: "reports", path: "/app/reports/sales", wait: 3000 },
    { name: "activity", path: "/app/staff?tab=activity" },
    { name: "overview-mobile", path: "/app/overview?period=month", width: 390, height: 844, scale: 3, mobile: true, wait: 3000 },
  ];

  const { token } = await createSession({ userId: owner.id, scope: "RESTAURANT", restaurantId, remember: false });
  const browser = await launchBrowser();
  try {
    const { cdp } = browser;
    const { targetId } = await cdp.send<{ targetId: string }>("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.send<{ sessionId: string }>("Target.attachToTarget", { targetId, flatten: true });
    await cdp.send("Page.enable", {}, sessionId);
    await cdp.send("Network.enable", {}, sessionId);
    await cdp.send("Network.setCookie", { name: "tabla_session", value: token, url: BASE, httpOnly: true, path: "/" }, sessionId);

    for (const shot of shots) {
      const width = shot.width ?? 1440;
      const height = shot.height ?? 900;
      await cdp.send(
        "Emulation.setDeviceMetricsOverride",
        { width, height, deviceScaleFactor: shot.scale ?? 2, mobile: shot.mobile ?? false },
        sessionId,
      );
      let clockScript: string | null = null;
      if (shot.serviceClock) {
        const { identifier } = await cdp.send<{ identifier: string }>(
          "Page.addScriptToEvaluateOnNewDocument",
          {
            source: `(() => { const offset = ${serviceNow} - Date.now(); const Real = Date; class Pinned extends Real { constructor(...a) { if (a.length) super(...a); else super(Real.now() + offset); } static now() { return Real.now() + offset; } } window.Date = Pinned; })();`,
          },
          sessionId,
        );
        clockScript = identifier;
      }
      const loaded = cdp.waitFor("Page.loadEventFired", sessionId);
      await cdp.send("Page.navigate", { url: `${BASE}${shot.path}` }, sessionId);
      await loaded;
      await sleep(shot.wait ?? 2000);
      // Hide dev-only overlays and toasts so the shot looks like production.
      await cdp.send(
        "Runtime.evaluate",
        {
          expression: `document.querySelectorAll('nextjs-portal,[data-sonner-toaster]').forEach(e=>e.remove());document.activeElement?.blur?.();window.scrollTo(0,0);`,
        },
        sessionId,
      );
      await sleep(300);
      const { data } = await cdp.send<{ data: string }>("Page.captureScreenshot", { format: "webp", quality: 86 }, sessionId);
      if (clockScript) await cdp.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: clockScript }, sessionId);
      const file = path.join(OUT, `${shot.name}.webp`);
      writeFileSync(file, Buffer.from(data, "base64"));
      console.log(`✓ ${shot.name.padEnd(16)} ${width}×${height} @${shot.scale ?? 2}x → ${path.relative(process.cwd(), file)}`);
    }
  } finally {
    await browser.close();
    await revokeSession(token);
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
