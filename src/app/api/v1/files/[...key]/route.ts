import { errorResponse, resolveApiContext } from "@/server/api/handler";
import { ForbiddenError, NotFoundError, UnauthorizedError } from "@/server/errors";
import { storage } from "@/server/storage";

/** Serve an uploaded file — only to users of the restaurant that owns it. */
export async function GET(req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  try {
    const ctx = await resolveApiContext(req);
    if (!ctx) throw new UnauthorizedError();
    const key = (await params).key.join("/");
    if (!key.startsWith(`${ctx.restaurantId}/`)) throw new ForbiddenError();
    const file = await storage.get(key);
    if (!file) throw new NotFoundError("File");
    return new Response(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": file.type,
        "Cache-Control": "private, max-age=86400",
        "X-Content-Type-Options": "nosniff",
        ...(file.type === "application/pdf" ? { "Content-Disposition": "inline" } : {}),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
