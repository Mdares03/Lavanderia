import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { requireAdminFromRequest } from "@/server/services/authService";
import { ensureSystemBootstrapped } from "@/server/system/bootstrap";

export async function GET(request: Request) {
  await ensureSystemBootstrapped();
  try {
    await requireAdminFromRequest(request);
    const reasons = await prisma.voidReason.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "asc" }
    });
    return ok({ reasons });
  } catch (error) {
    return fail("No fue posible cargar motivos de anulacion", 403, String(error));
  }
}
