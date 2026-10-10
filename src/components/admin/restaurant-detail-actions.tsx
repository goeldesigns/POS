"use client";

import { Archive, ArchiveRestore, Pause, Pencil, Play } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/display";
import { RestaurantStatusDialogs, type StatusChange, type StatusTarget } from "./restaurant-status";

export function RestaurantHeaderActions({ target }: { target: StatusTarget }) {
  const router = useRouter();
  const [change, setChange] = React.useState<StatusChange | null>(null);
  return (
    <>
      {target.status !== "ARCHIVED" ? (
        <Button variant="outline" asChild>
          <Link href={`/super-admin/restaurants/${target.id}?tab=settings`}>
            <Pencil /> Edit
          </Link>
        </Button>
      ) : null}
      {target.status === "ACTIVE" ? (
        <Button variant="outline" onClick={() => setChange("suspend")}>
          <Pause /> Suspend
        </Button>
      ) : (
        <Button variant={target.status === "ARCHIVED" ? "primary" : "success"} onClick={() => setChange("activate")}>
          {target.status === "ARCHIVED" ? <ArchiveRestore /> : <Play />} {target.status === "ARCHIVED" ? "Restore" : "Re-activate"}
        </Button>
      )}
      <RestaurantStatusDialogs target={target} change={change} onClose={() => setChange(null)} onArchived={() => router.push("/super-admin/restaurants")} />
    </>
  );
}

export function DangerZone({ target }: { target: StatusTarget }) {
  const router = useRouter();
  const [change, setChange] = React.useState<StatusChange | null>(null);
  const rows: { title: string; text: string; action: React.ReactNode }[] = [];
  if (target.status === "ACTIVE") {
    rows.push({
      title: "Suspend restaurant",
      text: "Blocks every user from the POS, back office and API until you re-activate it. Nothing is deleted.",
      action: (
        <Button variant="danger-soft" onClick={() => setChange("suspend")}>
          <Pause /> Suspend
        </Button>
      ),
    });
  } else if (target.status === "SUSPENDED") {
    rows.push({
      title: "Re-activate restaurant",
      text: "Restores access for every user with their existing roles and permissions.",
      action: (
        <Button variant="success" onClick={() => setChange("activate")}>
          <Play /> Re-activate
        </Button>
      ),
    });
  }
  if (target.status !== "ARCHIVED") {
    rows.push({
      title: "Archive restaurant",
      text: "Removes it from the platform, signs everyone out and revokes API keys. Data is retained and the restaurant can be restored.",
      action: (
        <Button variant="danger" onClick={() => setChange("archive")}>
          <Archive /> Archive
        </Button>
      ),
    });
  } else {
    rows.push({
      title: "Restore restaurant",
      text: "Brings the restaurant back with all of its data. Users can sign in again.",
      action: (
        <Button onClick={() => setChange("activate")}>
          <ArchiveRestore /> Restore
        </Button>
      ),
    });
  }
  return (
    <Card className="border-danger-100">
      <CardHeader title="Danger zone" description="These actions affect everyone at this restaurant and are recorded in the audit log." />
      <ul className="divide-y divide-line border-t border-line">
        {rows.map((r) => (
          <li key={r.title} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div className="min-w-0 max-w-[560px]">
              <p className="text-[13px] font-semibold text-ink">{r.title}</p>
              <p className="mt-0.5 text-[13px] text-muted">{r.text}</p>
            </div>
            {r.action}
          </li>
        ))}
      </ul>
      <RestaurantStatusDialogs target={target} change={change} onClose={() => setChange(null)} onArchived={() => router.push("/super-admin/restaurants")} />
    </Card>
  );
}
