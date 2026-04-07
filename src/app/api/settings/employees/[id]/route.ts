import { z } from "zod";

import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { requireAdminFromRequest } from "@/server/services/authService";
import { ensureSystemBootstrapped } from "@/server/system/bootstrap";

const patchSchema = z.object({
  name: z.string().min(2).optional(),
  pin: z.string().length(4).optional(),
  isAdmin: z.boolean().optional(),
  isActive: z.boolean().optional()
});

type Context = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: Context) {
  await ensureSystemBootstrapped();
  try {
    await requireAdminFromRequest(request);
    const { id } = await context.params;
    const payload = patchSchema.parse(await request.json());
    const employee = await prisma.employee.update({
      where: { id },
      data: payload
    });
    return ok({ employee });
  } catch (error) {
    return fail("No fue posible actualizar empleado", 403, String(error));
  }
}
