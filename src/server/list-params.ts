export type SearchParams = Record<string, string | string[] | undefined>;

export function param(sp: SearchParams, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

export interface ListParams<S extends string> {
  q: string;
  page: number;
  pageSize: number;
  skip: number;
  sort: S;
  dir: "asc" | "desc";
}

/** Parse and clamp common list params (search, pagination, whitelisted sort). */
export function parseListParams<S extends string>(
  sp: SearchParams,
  opts: { sortable: readonly S[]; defaultSort: S; defaultDir?: "asc" | "desc"; defaultPageSize?: number },
): ListParams<S> {
  const q = (param(sp, "q") ?? "").trim().slice(0, 100);
  const pageSize = [10, 20, 50, 100].includes(Number(param(sp, "pageSize"))) ? Number(param(sp, "pageSize")) : (opts.defaultPageSize ?? 20);
  const page = Math.max(1, Math.min(10_000, Number.parseInt(param(sp, "page") ?? "1", 10) || 1));
  const sortParam = param(sp, "sort") as S | undefined;
  const sort = sortParam && opts.sortable.includes(sortParam) ? sortParam : opts.defaultSort;
  const dirParam = param(sp, "dir");
  const dir = dirParam === "asc" || dirParam === "desc" ? dirParam : sortParam ? "desc" : (opts.defaultDir ?? "desc");
  return { q, page, pageSize, skip: (page - 1) * pageSize, sort, dir };
}
