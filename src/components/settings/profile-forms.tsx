"use client";

import * as React from "react";
import { TextField, useFormSubmit, useZodForm } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/display";
import { changePasswordSchema, profileSchema } from "@/lib/validation/auth";
import type { ActionResult } from "@/lib/action-result";

type ProfileAction = (input: { name: string; phone?: string | null }) => Promise<ActionResult<{ ok: boolean }>>;
type PasswordAction = (input: { currentPassword: string; newPassword: string; confirmPassword: string }) => Promise<ActionResult<{ ok: boolean }>>;

export function ProfileForms({ name, email, phone, profileAction, passwordAction }: { name: string; email: string; phone: string | null; profileAction: ProfileAction; passwordAction: PasswordAction }) {
  const profile = useZodForm(profileSchema, { name, phone: phone ?? "" });
  const password = useZodForm(changePasswordSchema, { currentPassword: "", newPassword: "", confirmPassword: "" });
  const saveProfile = useFormSubmit(profile, profileAction, { success: "Profile updated" });
  const savePassword = useFormSubmit(password, passwordAction, { success: "Password changed — other devices were signed out", onSuccess: () => password.reset() });
  return (
    <div className="grid max-w-[880px] gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Profile" description={email} />
        <CardBody>
          <form onSubmit={saveProfile} noValidate className="space-y-4">
            <TextField control={profile.control} name="name" label="Full name" required />
            <TextField control={profile.control} name="phone" label="Phone" optional />
            <Button type="submit" loading={profile.formState.isSubmitting}>Save profile</Button>
          </form>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Change password" description="You'll stay signed in on this device." />
        <CardBody>
          <form onSubmit={savePassword} noValidate className="space-y-4">
            <TextField control={password.control} name="currentPassword" label="Current password" type="password" autoComplete="current-password" />
            <TextField control={password.control} name="newPassword" label="New password" type="password" autoComplete="new-password" description="8+ characters with a letter and a number" />
            <TextField control={password.control} name="confirmPassword" label="Confirm new password" type="password" autoComplete="new-password" />
            <Button type="submit" loading={password.formState.isSubmitting}>Update password</Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
