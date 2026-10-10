import { cn } from "@/lib/utils";

/** Standard page container: consistent gutters and max width. */
export function Page({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[1520px] px-4 py-5 sm:px-6 lg:px-7 lg:py-6", className)}>{children}</div>;
}
