import { z } from "zod";

import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { ensurePinAvailable, requireAdminFromRequest } from "@/server/services/authService";
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
    const requester = await requireAdminFromRequest(request);
    const { id } = await context.params;
    const payload = patchSchema.parse(await request.json());

    if (payload.pin) {
      await ensurePinAvailable(payload.pin, id);
    }

    if (payload.isAdmin === false) {
      const target = await prisma.employee.findUnique({
        where: { id },
        select: { id: true, isAdmin: true, isActive: true }
      });

      if (!target) {
        return fail("Empleado no encontrado", 404, "employee_not_found");
      }

      if (requester.id === id) {
        return fail("No puedes quitarte permisos de administrador", 400, "self_admin_demotion_blocked");
      }

      if (target.isAdmin && target.isActive) {
        const activeAdminCount = await prisma.employee.count({
          where: {
            isAdmin: true,
            isActive: true
          }
        });

        if (activeAdminCount <= 1) {
          return fail("Debe existir al menos un administrador activo", 400, "last_admin_blocked");
        }
      }
    }

    const employee = await prisma.employee.update({
      where: { id },
      data: payload
    });
    return ok({ employee });
  } catch (error) {
    return fail("No fue posible actualizar empleado", 403, String(error));
  }
}
