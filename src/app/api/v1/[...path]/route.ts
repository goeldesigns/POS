const BACKEND_URL = (process.env.BACKEND_URL ?? "http://127.0.0.1:8081").replace(/\/$/, "");

const DROPPED_REQUEST = ["connection", "content-length", "x-forwarded-host", "x-forwarded-proto"];
const DROPPED_RESPONSE = ["content-encoding", "content-length", "transfer-encoding", "connection"];

async function forward(request: Request): Promise<Response> {
  const incoming = new URL(request.url);
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!DROPPED_REQUEST.includes(key.toLowerCase())) headers.set(key, value);
  });
  headers.set("x-forwarded-host", request.headers.get("host") ?? incoming.host);
  headers.set("x-forwarded-proto", incoming.protocol.replace(":", ""));
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const upstream = await fetch(`${BACKEND_URL}${incoming.pathname}${incoming.search}`, {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    redirect: "manual",
    cache: "no-store",
    ...(hasBody ? { duplex: "half" } : {}),
  } as RequestInit).catch(() => null);
  if (!upstream) {
    return Response.json({ error: { code: "service_unavailable", message: "The service is temporarily unavailable. Please try again." } }, { status: 503 });
  }
  const out = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!DROPPED_RESPONSE.includes(key.toLowerCase()) && key.toLowerCase() !== "set-cookie") out.append(key, value);
  });
  for (const cookie of upstream.headers.getSetCookie()) out.append("set-cookie", cookie);
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
