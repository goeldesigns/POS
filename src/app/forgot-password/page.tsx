import { redirect } from "next/navigation";
import type { SearchParams } from "@/server/list-params";

/** Short URL kept for the future marketing site. */
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const qs = new URLSearchParams(Object.entries(await searchParams).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
  redirect(`/auth/forgot-password${qs.size ? `?${qs}` : ""}`);
}
