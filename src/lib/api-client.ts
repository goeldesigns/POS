/** Minimal client for our own JSON API envelope ({ data } | { error }). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
    credentials: "same-origin",
  });
  let body: { data?: T; error?: { message: string; code?: string } } | null = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok || !body || body.error) {
    throw new ApiError(body?.error?.message ?? "Request failed", res.status, body?.error?.code);
  }
  return body.data as T;
}
