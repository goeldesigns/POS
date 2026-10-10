"use client";

import { Ellipsis, Gift, Pencil, ShoppingBag, Trash } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useSession } from "@/components/shell/session-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/menu";
import { ConfirmDialog } from "@/components/ui/overlay";
import { useAction } from "@/hooks/use-action";
import { addCustomerNoteAction, deleteCustomerAction } from "@/server/actions/customers";
import { AdjustPointsDialog, CustomerDialog, type CustomerFormValue } from "./customer-dialogs";

export function CustomerProfileActions({ customer, balance }: { customer: CustomerFormValue; balance: number }) {
  const session = useSession();
  const router = useRouter();
  const [dialog, setDialog] = React.useState<"edit" | "delete" | "points" | null>(null);
  const del = useAction(deleteCustomerAction, { success: "Customer deleted", onSuccess: () => router.push("/app/customers") });
  return (
    <>
      {session.can("pos.create_order") ? (
        <Button variant="outline" asChild>
          <Link href={`/app/pos?customer=${customer.id}`}>
            <ShoppingBag /> New order
          </Link>
        </Button>
      ) : null}
      {session.can("customers.edit") ? (
        <Button onClick={() => setDialog("edit")}>
          <Pencil /> Edit
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="More">
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {session.can("loyalty.manage") ? (
            <DropdownMenuItem onSelect={() => setDialog("points")}>
              <Gift /> Adjust loyalty points
            </DropdownMenuItem>
          ) : null}
          {session.can("customers.delete") ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem tone="danger" onSelect={() => setDialog("delete")}>
                <Trash /> Delete customer
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <CustomerDialog open={dialog === "edit"} onOpenChange={(o) => setDialog(o ? "edit" : null)} value={customer} />
      <AdjustPointsDialog open={dialog === "points"} onOpenChange={(o) => setDialog(o ? "points" : null)} customer={{ id: customer.id, name: customer.name, balance }} />
      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={(o) => setDialog(o ? "delete" : null)}
        title={`Delete ${customer.name}?`}
        description="Their contact details are erased. Past orders stay in your reports under their name."
        confirmLabel="Delete customer"
        confirmText="DELETE"
        loading={del.pending}
        onConfirm={() => del.execute({ id: customer.id })}
      />
    </>
  );
}

export function NoteForm({ customerId }: { customerId: string }) {
  const [body, setBody] = React.useState("");
  const add = useAction(addCustomerNoteAction, { success: "Note added", onSuccess: () => setBody("") });
  return (
    <div className="space-y-2">
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Allergies, preferences, feedback…" className="min-h-[64px]" maxLength={1000} />
      <div className="flex justify-end">
        <Button size="sm" variant="secondary" disabled={!body.trim()} loading={add.pending} onClick={() => add.execute({ customerId, body: body.trim() })}>
          Add note
        </Button>
      </div>
    </div>
  );
}
