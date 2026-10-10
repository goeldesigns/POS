"use client";

import { Segmented } from "@/components/ui/controls";
import { useQueryParams } from "@/hooks/use-query-params";

export function PeriodSwitch<T extends string>({
  value,
  options,
  param = "period",
  defaultValue,
}: {
  value: T;
  options: { value: T; label: string }[];
  param?: string;
  defaultValue: T;
}) {
  const { set } = useQueryParams();
  return <Segmented value={value} options={options} onChange={(v) => set({ [param]: v === defaultValue ? null : v })} />;
}
