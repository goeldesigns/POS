"use client";

import { FileText, ImagePlus, LoaderCircle, X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

async function upload(file: File): Promise<{ url: string; name: string }> {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch("/api/v1/uploads", { method: "POST", body, credentials: "same-origin" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.data) throw new Error(json?.error?.message ?? "Upload failed");
  return json.data;
}

/** Image picker: upload a file or paste an https URL. */
export function ImageInput({ value, onChange, className }: { value: string | null; onChange: (url: string | null) => void; className?: string }) {
  const [busy, setBusy] = React.useState(false);
  const [broken, setBroken] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => setBroken(false), [value]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const r = await upload(file);
      onChange(r.url);
      toast.success("Image uploaded");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn("flex gap-4", className)}>
      <button suppressHydrationWarning
        type="button"
        onClick={() => inputRef.current?.click()}
        className="group relative grid size-28 shrink-0 place-items-center overflow-hidden rounded-xl border border-dashed border-line-strong bg-canvas text-muted transition-colors hover:border-brand-300 hover:bg-brand-50"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void pick(e.dataTransfer.files[0]);
        }}
      >
        {value && !broken ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="size-full object-cover" onError={() => setBroken(true)} />
        ) : busy ? (
          <LoaderCircle className="size-5 animate-spin" />
        ) : (
          <span className="flex flex-col items-center gap-1 text-2xs">
            <ImagePlus className="size-5" /> Upload
          </span>
        )}
      </button>
      <div className="min-w-0 flex-1 space-y-2">
        <Input placeholder="…or paste an https:// image URL" value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} />
        <p className="text-xs text-muted">JPG, PNG or WebP up to 5 MB. Square or 4:3 photos look best on the POS.</p>
        {value ? (
          <Button variant="ghost" size="xs" onClick={() => onChange(null)}>
            <X /> Remove image
          </Button>
        ) : null}
        <input suppressHydrationWarning ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      </div>
    </div>
  );
}

/** Attachment (receipt/bill) upload for expenses. */
export function AttachmentInput({
  value,
  name,
  onChange,
}: {
  value: string | null;
  name: string | null;
  onChange: (v: { url: string | null; name: string | null }) => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const ref = React.useRef<HTMLInputElement>(null);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const r = await upload(file);
      onChange({ url: r.url, name: r.name });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return value ? (
    <div className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[13px]">
      <FileText className="size-4 text-muted" />
      <a href={value} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-medium text-brand-600 hover:underline">
        {name ?? "Attachment"}
      </a>
      <Button variant="ghost" size="icon-xs" aria-label="Remove attachment" onClick={() => onChange({ url: null, name: null })}>
        <X />
      </Button>
    </div>
  ) : (
    <>
      <Button variant="outline" size="sm" loading={busy} onClick={() => ref.current?.click()}>
        <FileText /> Attach bill or receipt
      </Button>
      <input suppressHydrationWarning ref={ref} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
    </>
  );
}
