import { tenantRoute } from "@/server/api/handler";
import { ValidationError } from "@/server/errors";
import { storage } from "@/server/storage";

/** Multipart upload: field "file". Returns { url, key, name }. */
export const POST = tenantRoute({ permission: ["menu.create", "menu.edit", "expenses.create", "expenses.edit", "settings.edit"] }, async (req, ctx) => {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new ValidationError("Choose a file to upload");
  const bytes = Buffer.from(await file.arrayBuffer());
  const stored = await storage.put(ctx.restaurantId, { name: file.name, type: file.type, bytes });
  return { ...stored, name: file.name.slice(0, 160) };
});
