"use client";

import { RefreshCw } from "lucide-react";
import * as React from "react";
import { SwitchField, TextField, useFormSubmit, useZodForm } from "@/components/forms/fields";
import { useSession } from "@/components/shell/session-context";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/display";
import { useAction } from "@/hooks/use-action";
import { formatMoney } from "@/lib/format";
import { loyaltyProgramSchema } from "@/lib/validation/inventory";
import { runLoyaltyMaintenanceAction, saveLoyaltyProgramAction } from "@/server/actions/growth";

export interface ProgramValue {
  isEnabled: boolean;
  pointsPerHundred: number;
  pointValue: number;
  minRedeemPoints: number;
  maxRedeemPercent: number;
  expiryDays: number | null;
  signupBonus: number;
  birthdayBonus: number;
}

export function ProgramSettings({ program }: { program: ProgramValue }) {
  const session = useSession();
  const canManage = session.can("loyalty.manage");
  const form = useZodForm(loyaltyProgramSchema, {
    isEnabled: program.isEnabled,
    pointsPerHundred: String(program.pointsPerHundred),
    pointValue: String(program.pointValue / 100),
    minRedeemPoints: String(program.minRedeemPoints),
    maxRedeemPercent: String(program.maxRedeemPercent),
    expiryDays: program.expiryDays != null ? String(program.expiryDays) : "",
    signupBonus: String(program.signupBonus),
    birthdayBonus: String(program.birthdayBonus),
  });
  const submit = useFormSubmit(form, saveLoyaltyProgramAction, { success: "Loyalty programme saved" });
  const v = form.watch();
  const earnOn1000 = Math.floor(10 * (Number(v.pointsPerHundred) || 0));
  const worth = earnOn1000 * (Number(v.pointValue) || 0);
  return (
    <Card>
      <CardHeader title="Programme rules" description={`A ₹1,000 bill earns ${earnOn1000} points worth ${formatMoney(Math.round(worth * 100))} (${((worth / 1000) * 100).toFixed(1)}% back).`} />
      <CardBody>
        <form onSubmit={submit} noValidate className="space-y-4">
          <SwitchField control={form.control} name="isEnabled" label="Loyalty programme active" description="When off, no points are earned or redeemed." disabled={!canManage} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField control={form.control} name="pointsPerHundred" label="Points per ₹100 spent" inputMode="numeric" disabled={!canManage} />
            <TextField control={form.control} name="pointValue" label="Value of 1 point" prefix="₹" inputMode="decimal" disabled={!canManage} />
            <TextField control={form.control} name="minRedeemPoints" label="Minimum to redeem" suffix="pts" inputMode="numeric" disabled={!canManage} />
            <TextField control={form.control} name="maxRedeemPercent" label="Max share of a bill" suffix="%" inputMode="numeric" disabled={!canManage} />
            <TextField control={form.control} name="expiryDays" label="Points expire after" suffix="days" inputMode="numeric" description="Leave empty for no expiry" disabled={!canManage} />
            <div />
            <TextField control={form.control} name="signupBonus" label="Signup bonus" suffix="pts" inputMode="numeric" disabled={!canManage} />
            <TextField control={form.control} name="birthdayBonus" label="Birthday bonus" suffix="pts" inputMode="numeric" disabled={!canManage} />
          </div>
          {canManage ? (
            <div className="flex justify-end">
              <Button type="submit" loading={form.formState.isSubmitting}>Save rules</Button>
            </div>
          ) : null}
        </form>
      </CardBody>
    </Card>
  );
}

export function MaintenanceButton() {
  const session = useSession();
  const run = useAction(runLoyaltyMaintenanceAction, { success: (r) => `${r.expired} points expired · ${r.birthdays} birthday bonuses granted` });
  if (!session.can("loyalty.manage")) return null;
  return (
    <Button variant="outline" loading={run.pending} onClick={() => run.execute({})}>
      <RefreshCw /> Run expiry & birthday bonuses
    </Button>
  );
}
