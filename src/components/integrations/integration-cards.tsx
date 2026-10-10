"use client";

import { Bike, CircleCheck, Copy, FlaskConical, KeyRound, Link2, PlugZap, RefreshCw, Unlink } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { useSession } from "@/components/shell/session-context";
import { Button } from "@/components/ui/button";
import { SwitchRow } from "@/components/ui/controls";
import { Card, CardBody, EmptyState, InlineAlert, StatusBadge } from "@/components/ui/display";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/overlay";
import { useAction } from "@/hooks/use-action";
import { formatDateTime } from "@/lib/format";
import { EXTERNAL_ORDER_STATUS, INTEGRATION_STATUS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import {
  acceptExternalOrderAction,
  disconnectIntegrationAction,
  rejectExternalOrderAction,
  sandboxOrderAction,
  saveIntegrationCredentialsAction,
  saveIntegrationSettingsAction,
  testIntegrationAction,
} from "@/server/actions/growth";
import type { getIntegrations } from "@/server/services/integrations";

type Data = Awaited<ReturnType<typeof getIntegrations>>;
type Integration = Data["integrations"][number];

const BRAND: Record<string, string> = { SWIGGY: "bg-[#fff1e8] text-[#c2410c]", ZOMATO: "bg-[#fdecec] text-[#b91c1c]" };

export function IntegrationCards({ data, webhookBase, slug, sandbox }: { data: Data; webhookBase: string; slug: string; sandbox: boolean }) {
  const session = useSession();
  const tz = session.restaurant.timezone;
  const accept = useAction(acceptExternalOrderAction, { success: (r) => (r.status === "IMPORTED" ? "Order accepted and sent to kitchen" : "Couldn't import — see the error") });
  const [rejecting, setRejecting] = React.useState<string | null>(null);
  const reject = useAction(rejectExternalOrderAction, { success: "Order rejected", onSuccess: () => setRejecting(null) });

  if (!data.integrations.length) return <EmptyState icon={<Bike />} title="No aggregator modules enabled" description="Ask Tabla support to enable Swiggy or Zomato for your plan." />;

  return (
    <div className="space-y-4">
      <InlineAlert tone="info" icon={<PlugZap />} title="How aggregator orders reach your kitchen">
        Each platform posts orders to your webhook. Tabla verifies the signature, matches items to your menu by SKU, and drops them into the same
        kitchen queue as POS orders (source: Swiggy/Zomato). Live partner APIs (menu sync, accept/reject on the platform) activate after partner onboarding.
      </InlineAlert>
      <div className="grid gap-4 xl:grid-cols-2">
        {data.integrations.map((i) => (
          <IntegrationCard key={i.provider} i={i} webhookUrl={`${webhookBase}/api/v1/integrations/${i.provider.toLowerCase()}/webhook?restaurant=${slug}`} sandbox={sandbox} tz={tz} />
        ))}
      </div>
      <Card className="overflow-hidden">
        <div className="border-b border-line px-5 py-3">
          <p className="text-[15px] font-semibold text-ink">Incoming orders</p>
          <p className="text-[13px] text-muted">Latest orders received from aggregators</p>
        </div>
        {data.externalOrders.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13px]">
              <thead>
                <tr className="bg-canvas/70 text-xs text-muted">
                  {["Received", "Platform", "Platform order", "Customer", "Items", "Status", "Tabla order", ""].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left font-medium first:pl-5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.externalOrders.map((e) => (
                  <tr key={e.id} className="border-t border-line align-top">
                    <td className="px-4 py-2.5 pl-5 whitespace-nowrap text-muted">{formatDateTime(e.receivedAt, tz)}</td>
                    <td className="px-4 py-2.5"><span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold", BRAND[e.provider])}>{e.provider === "SWIGGY" ? "Swiggy" : "Zomato"}</span></td>
                    <td className="px-4 py-2.5 font-mono text-xs">{e.externalId}</td>
                    <td className="px-4 py-2.5">{e.customer}</td>
                    <td className="px-4 py-2.5">{e.items}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge dict={EXTERNAL_ORDER_STATUS} value={e.status} size="sm" />
                      {e.error ? <p className="mt-1 max-w-[260px] text-xs text-danger-700">{e.error}</p> : null}
                    </td>
                    <td className="px-4 py-2.5">{e.order ? <a className="font-medium text-brand-600" href={`/app/orders?order=${e.order.id}`}>{e.order.orderNumber}</a> : "—"}</td>
                    <td className="px-4 py-2.5 pr-5 text-right">
                      {e.status === "RECEIVED" || e.status === "FAILED" ? (
                        <div className="flex justify-end gap-1">
                          <Button size="xs" loading={accept.pending} onClick={() => accept.execute({ id: e.id })}>Accept</Button>
                          <Button size="xs" variant="outline" onClick={() => setRejecting(e.id)}>Reject</Button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState compact title="No aggregator orders yet" description={sandbox ? "Use “Send sandbox order” to see the flow end to end." : "Orders appear here as soon as a platform posts to your webhook."} />
        )}
      </Card>
      <ConfirmDialog
        open={!!rejecting}
        onOpenChange={(o) => !o && setRejecting(null)}
        title="Reject this order?"
        description="It won't be sent to the kitchen. Remember to reject it on the platform too until partner sync is active."
        confirmLabel="Reject order"
        loading={reject.pending}
        onConfirm={() => reject.execute({ id: rejecting!, reason: "Rejected by restaurant" })}
      />
    </div>
  );
}

function IntegrationCard({ i, webhookUrl, sandbox, tz }: { i: Integration; webhookUrl: string; sandbox: boolean; tz: string }) {
  const [settings, setSettings] = React.useState({ storeId: i.storeId ?? "", autoAcceptOrders: i.autoAcceptOrders, autoSyncMenu: i.autoSyncMenu, syncInventory: i.syncInventory, syncPricing: i.syncPricing });
  const [credsOpen, setCredsOpen] = React.useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = React.useState(false);
  const save = useAction(saveIntegrationSettingsAction, { success: "Settings saved" });
  const test = useAction(testIntegrationAction, { success: (r) => r.message });
  const disconnect = useAction(disconnectIntegrationAction, { success: `${i.displayName} disconnected`, onSuccess: () => setConfirmDisconnect(false) });
  const sandboxOrder = useAction(sandboxOrderAction, { success: (r) => (r.status === "IMPORTED" ? "Sandbox order imported to the kitchen" : r.status === "RECEIVED" ? "Sandbox order received — accept it below" : "Sandbox order failed to import") });
  const dirty = settings.storeId !== (i.storeId ?? "") || settings.autoAcceptOrders !== i.autoAcceptOrders || settings.autoSyncMenu !== i.autoSyncMenu || settings.syncInventory !== i.syncInventory || settings.syncPricing !== i.syncPricing;

  return (
    <Card>
      <div className="flex items-start gap-3 border-b border-line p-5">
        <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl text-lg font-bold", BRAND[i.provider])}>{i.displayName[0]}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold text-ink">{i.displayName}</h3>
            <StatusBadge dict={INTEGRATION_STATUS} value={i.status} />
          </div>
          <p className="mt-0.5 text-[13px] text-muted">
            {i.hasCredentials ? `API key …${i.keyHint} · saved ${i.credentialsUpdatedAt ? formatDateTime(i.credentialsUpdatedAt, tz) : ""}` : "No credentials saved"}
          </p>
          {i.lastSyncStatus ? <p className="mt-1 text-xs text-muted">Last check {i.lastSyncAt ? formatDateTime(i.lastSyncAt, tz) : ""}: {i.lastSyncStatus}</p> : null}
        </div>
      </div>
      <CardBody className="space-y-4 pt-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            ["Imported", i.counts.IMPORTED ?? 0],
            ["Awaiting", i.counts.RECEIVED ?? 0],
            ["Failed", i.counts.FAILED ?? 0],
          ].map(([l, n]) => (
            <div key={l} className="rounded-lg bg-canvas py-2">
              <p className="text-lg font-semibold text-ink">{n}</p>
              <p className="text-2xs text-muted">{l}</p>
            </div>
          ))}
        </div>

        <Field label="Store / outlet ID" description={`Your ${i.displayName} restaurant ID`}>
          <Input value={settings.storeId} disabled={!i.canManage} onChange={(e) => setSettings({ ...settings, storeId: e.target.value })} placeholder="e.g. 482113" />
        </Field>
        <div className="space-y-1.5">
          <SwitchRow label="Auto-accept orders" description="Send incoming orders straight to the kitchen" checked={settings.autoAcceptOrders} disabled={!i.canManage} onCheckedChange={(v) => setSettings({ ...settings, autoAcceptOrders: v })} />
          <SwitchRow label="Auto-sync menu" description="Push menu changes to the platform (needs partner API)" checked={settings.autoSyncMenu} disabled={!i.canManage} onCheckedChange={(v) => setSettings({ ...settings, autoSyncMenu: v })} />
          <SwitchRow label="Sync stock availability" description="Mark items out of stock on the platform" checked={settings.syncInventory} disabled={!i.canManage} onCheckedChange={(v) => setSettings({ ...settings, syncInventory: v })} />
          <SwitchRow label="Sync pricing" description="Keep platform prices equal to your menu" checked={settings.syncPricing} disabled={!i.canManage} onCheckedChange={(v) => setSettings({ ...settings, syncPricing: v })} />
        </div>

        <div className="rounded-xl border border-dashed border-line-strong bg-canvas p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-ink-2"><Link2 className="size-3.5" /> Webhook URL</p>
          <div className="mt-1 flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted" title={webhookUrl}>
              {webhookUrl}
            </p>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() =>
                navigator.clipboard.writeText(webhookUrl).then(
                  () => toast.success("Webhook URL copied"),
                  () => toast.error("Couldn't copy — select the URL and copy it manually"),
                )
              }
            >
              <Copy /> Copy
            </Button>
          </div>
          <p className="mt-1 text-2xs text-subtle">Sign each request with header X-Tabla-Signature = HMAC-SHA256(body, webhook secret).</p>
        </div>

        {i.canManage ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={!dirty} loading={save.pending} onClick={() => save.execute({ provider: i.provider, ...settings, storeId: settings.storeId || null })}>
              Save settings
            </Button>
            <Button size="sm" variant="outline" onClick={() => setCredsOpen(true)}>
              <KeyRound /> {i.hasCredentials ? "Update credentials" : "Connect"}
            </Button>
            {i.hasCredentials ? (
              <Button size="sm" variant="outline" loading={test.pending} onClick={() => test.execute({ provider: i.provider })}>
                <RefreshCw /> Test connection
              </Button>
            ) : null}
            {sandbox && i.hasCredentials ? (
              <Button size="sm" variant="secondary" loading={sandboxOrder.pending} onClick={() => sandboxOrder.execute({ provider: i.provider })}>
                <FlaskConical /> Send sandbox order
              </Button>
            ) : null}
            {i.hasCredentials ? (
              <Button size="sm" variant="ghost" className="text-danger-700" onClick={() => setConfirmDisconnect(true)}>
                <Unlink /> Disconnect
              </Button>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-muted">You can view this integration. Managing it needs the {i.displayName} “Manage” permission.</p>
        )}
        {sandbox && !i.hasCredentials && i.canManage ? <p className="text-xs text-muted">Save credentials (any test values work) to try a sandbox order.</p> : null}
      </CardBody>
      <CredentialsDialog open={credsOpen} onOpenChange={setCredsOpen} provider={i.provider} name={i.displayName} />
      <ConfirmDialog
        open={confirmDisconnect}
        onOpenChange={setConfirmDisconnect}
        title={`Disconnect ${i.displayName}?`}
        description="Stored credentials are deleted and new webhook calls will be refused. Past orders are kept."
        confirmLabel="Disconnect"
        loading={disconnect.pending}
        onConfirm={() => disconnect.execute({ provider: i.provider })}
      />
    </Card>
  );
}

function CredentialsDialog({ open, onOpenChange, provider, name }: { open: boolean; onOpenChange: (o: boolean) => void; provider: "SWIGGY" | "ZOMATO"; name: string }) {
  const [form, setForm] = React.useState({ apiKey: "", apiSecret: "", webhookSecret: "" });
  React.useEffect(() => {
    if (open) setForm({ apiKey: "", apiSecret: "", webhookSecret: `whsec_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}` });
  }, [open]);
  const save = useAction(saveIntegrationCredentialsAction, { success: (r) => r.message, onSuccess: () => onOpenChange(false) });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`${name} credentials`} description="Stored encrypted (AES-256-GCM). They're never shown again or sent to the browser." size="sm">
        <DialogBody className="space-y-4">
          <Field label="API key" required>
            <Input value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} autoComplete="off" />
          </Field>
          <Field label="API secret" required>
            <Input type="password" value={form.apiSecret} onChange={(e) => setForm({ ...form, apiSecret: e.target.value })} autoComplete="new-password" />
          </Field>
          <Field label="Webhook secret" required description="Share this with the platform/middleware to sign webhook calls. Copy it now.">
            <Input value={form.webhookSecret} onChange={(e) => setForm({ ...form, webhookSecret: e.target.value })} className="font-mono text-xs" />
          </Field>
          <InlineAlert tone="neutral" icon={<CircleCheck />}>Status stays “Pending activation” until {name} approves your partner account.</InlineAlert>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={save.pending} disabled={!form.apiKey || !form.apiSecret || form.webhookSecret.length < 8} onClick={() => save.execute({ provider, ...form })}>
            Save securely
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

