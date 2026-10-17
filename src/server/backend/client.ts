import "server-only";
import { cookies, headers } from "next/headers";
import { AppError } from "../errors";

const BASE = (process.env.BACKEND_URL ?? "http://127.0.0.1:8081").replace(/\/$/, "");
const SESSION_COOKIES = ["tabla_session", "tabla_admin_session"] as const;

export type Query = Record<string, string | number | boolean | null | undefined>;

export interface Call {
  query?: Query;
  body?: unknown;
}

function withQuery(path: string, query?: Query) {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  const text = params.toString();
  return text ? `${path}?${text}` : path;
}

async function forwardedHeaders(extra: Record<string, string> = {}) {
  const store = await cookies();
  const incoming = await headers();
  const cookie = SESSION_COOKIES.flatMap((name) => {
    const value = store.get(name)?.value;
    return value ? [`${name}=${value}`] : [];
  }).join("; ");
  const out: Record<string, string> = { Accept: "application/json", ...extra };
  if (cookie) out.Cookie = cookie;
  const forwardedFor = incoming.get("x-forwarded-for") ?? incoming.get("x-real-ip");
  if (forwardedFor) out["X-Forwarded-For"] = forwardedFor;
  const agent = incoming.get("user-agent");
  if (agent) out["User-Agent"] = agent;
  return out;
}

async function failure(response: Response): Promise<never> {
  const text = await response.text();
  let parsed: { error?: { code?: string; message?: string; fieldErrors?: Record<string, string[]> } } | null = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  if (parsed?.error) {
    throw new AppError(parsed.error.message ?? "Something went wrong", { status: response.status, code: parsed.error.code ?? "bad_request", fieldErrors: parsed.error.fieldErrors });
  }
  throw new AppError("The service is temporarily unavailable. Please try again.", { status: 503, code: "service_unavailable" });
}

export async function send(method: string, path: string, call: Call = {}, extraHeaders: Record<string, string> = {}): Promise<Response> {
  const hasBody = call.body !== undefined;
  const response = await fetch(`${BASE}${withQuery(path, call.query)}`, {
    method,
    cache: "no-store",
    headers: await forwardedHeaders(hasBody ? { "Content-Type": "application/json", ...extraHeaders } : extraHeaders),
    body: hasBody ? JSON.stringify(call.body) : undefined,
  }).catch(() => {
    throw new AppError("The service is temporarily unavailable. Please try again.", { status: 503, code: "service_unavailable" });
  });
  if (!response.ok) await failure(response);
  return response;
}

async function data<T>(method: string, path: string, call?: Call): Promise<T> {
  const response = await send(method, path, call);
  const text = await response.text();
  return (text ? (JSON.parse(text) as { data: T }).data : (undefined as T));
}

export const backend = {
  get: <T>(path: string, query?: Query) => data<T>("GET", path, { query }),
  post: <T>(path: string, body?: unknown, query?: Query) => data<T>("POST", path, { body: body ?? {}, query }),
  put: <T>(path: string, body?: unknown) => data<T>("PUT", path, { body: body ?? {} }),
  delete: <T>(path: string) => data<T>("DELETE", path),
  send,
};

/** Cookie name, value and lifetime from a Set-Cookie header of the backend. */
export function parseSetCookie(header: string) {
  const [pair, ...attributes] = header.split(";").map((p) => p.trim());
  const eq = pair!.indexOf("=");
  const maxAge = attributes.find((a) => a.toLowerCase().startsWith("max-age="));
  return { name: pair!.slice(0, eq), value: pair!.slice(eq + 1), maxAge: maxAge ? Number(maxAge.split("=")[1]) : undefined };
}

/** Pass the session cookie the backend issued on to the browser. */
export async function relaySessionCookies(response: Response) {
  const store = await cookies();
  for (const line of response.headers.getSetCookie()) {
    const cookie = parseSetCookie(line);
    if (!SESSION_COOKIES.includes(cookie.name as (typeof SESSION_COOKIES)[number])) continue;
    if (cookie.maxAge === 0 || !cookie.value) {
      store.delete(cookie.name);
      continue;
    }
    store.set(cookie.name, cookie.value, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      ...(cookie.maxAge ? { maxAge: cookie.maxAge } : {}),
    });
  }
}
