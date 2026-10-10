"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/menu";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 20_000, refetchOnWindowFocus: false, retry: 1 },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider delayDuration={250}>
        {children}
        <Toaster
          position="bottom-center"
          closeButton
          toastOptions={{
            classNames: {
              toast: "!rounded-xl !border !border-line !bg-surface !shadow-pop !text-[13px] !text-ink !font-sans",
              description: "!text-muted",
              success: "[&_[data-icon]]:!text-success",
              error: "[&_[data-icon]]:!text-danger",
            },
          }}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
