"use client";

import { useRouter } from "next/navigation";
import { SelectField, SwitchField, TextField, TextareaField, useFormSubmit, useZodForm } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/display";
import { FormGrid, FormSection } from "@/components/ui/field";
import { platformSettingsSchema } from "@/lib/validation/platform";
import { savePlatformSettingsAction } from "@/server/actions/platform";
import type { PlatformSettings } from "@/server/services/platform";

export function PlatformSettingsForm({ value, plans }: { value: PlatformSettings; plans: { key: string; name: string }[] }) {
  const router = useRouter();
  const form = useZodForm(platformSettingsSchema, value);
  const submit = useFormSubmit(form, savePlatformSettingsAction, {
    success: "Platform settings saved",
    onSuccess: () => {
      form.reset(form.getValues());
      router.refresh();
    },
  });
  return (
    <form onSubmit={submit} noValidate>
      <Card className="px-5 sm:px-6">
        <FormSection title="Brand & support" description="Shown to restaurant users in emails, the suspension notice and help links.">
          <FormGrid>
            <TextField control={form.control} name="platformName" label="Platform name" required />
            <div />
            <TextField control={form.control} name="supportEmail" label="Support email" required type="email" />
            <TextField control={form.control} name="supportPhone" label="Support phone" optional />
          </FormGrid>
        </FormSection>
        <FormSection title="Sign-ups" description="Controls self-service restaurant registration at /auth/signup.">
          <div className="space-y-4">
            <SwitchField control={form.control} name="allowSelfSignup" label="Allow restaurants to sign up themselves" description="When off, only platform admins can create restaurants." />
            <FormGrid>
              <SelectField control={form.control} name="defaultPlanKey" label="Plan for new sign-ups" options={plans.map((p) => ({ value: p.key, label: p.name }))} description="New restaurants start a trial of this plan." />
            </FormGrid>
          </div>
        </FormSection>
        <FormSection title="Announcement" description="A banner shown at the top of every restaurant workspace — use it for planned maintenance.">
          <TextareaField control={form.control} name="maintenanceBanner" label="Banner text" optional rows={2} placeholder="e.g. Scheduled maintenance on Sunday 2:00–2:30 AM IST. Billing stays available offline." />
        </FormSection>
      </Card>
      <div className="mt-4 flex items-center justify-end gap-2">
        {form.formState.isDirty ? <p className="mr-auto text-xs text-muted">Unsaved changes</p> : null}
        <Button type="button" variant="outline" disabled={!form.formState.isDirty} onClick={() => form.reset(value)}>
          Discard
        </Button>
        <Button type="submit" loading={form.formState.isSubmitting} disabled={!form.formState.isDirty}>
          Save settings
        </Button>
      </div>
    </form>
  );
}
