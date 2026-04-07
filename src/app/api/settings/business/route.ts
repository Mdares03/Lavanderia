import { z } from "zod";

import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { requireAdminFromRequest } from "@/server/services/authService";
import { ensureSystemBootstrapped } from "@/server/system/bootstrap";

const patchSchema = z.object({
  businessName: z.string().min(2).max(80),
  timezone: z.string().min(3).max(50),
  currency: z.string().min(3).max(3)
});

export async function GET(request: Request) {
  await ensureSystemBootstrapped();
  try {
    await requireAdminFromRequest(request);
    const config = await prisma.appConfig.findUnique({ where: { id: 1 } });
    return ok({ config });
  } catch (error) {
    return fail("No autorizado", 403, String(error));
  }
}

export async function PATCH(request: Request) {
  await ensureSystemBootstrapped();
  try {
    await requireAdminFromRequest(request);
    const payload = patchSchema.parse(await request.json());
    const config = await prisma.appConfig.update({
      where: { id: 1 },
      data: payload
    });
    return ok({ config });
  } catch (error) {
    return fail("No fue posible actualizar negocio", 403, String(error));
  }
}
