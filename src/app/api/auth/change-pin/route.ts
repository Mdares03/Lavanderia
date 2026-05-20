import { z } from "zod";

import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { ensurePinAvailable, loginWithPin } from "@/server/services/authService";
import { ensureSystemBootstrapped } from "@/server/system/bootstrap";

const schema = z.object({
  employeeId: z.string().min(1),
  currentPin: z.string().regex(/^\d{4}$/),
  newPin: z.string().regex(/^\d{4}$/)
});

export async function POST(request: Request) {
  await ensureSystemBootstrapped();
  try {
    const payload = schema.parse(await request.json());
    const requester = await loginWithPin(payload.currentPin);

    if (requester.id !== payload.employeeId && !requester.isAdmin) {
      return fail("No autorizado para cambiar este PIN", 403);
    }

    if (payload.currentPin === payload.newPin && requester.id === payload.employeeId) {
      return fail("El nuevo PIN debe ser diferente al actual", 400);
    }

    await ensurePinAvailable(payload.newPin, payload.employeeId);

    const employee = await prisma.employee.update({
      where: { id: payload.employeeId },
      data: { pin: payload.newPin }
    });

    return ok({
      employee: {
        id: employee.id,
        name: employee.name,
        isAdmin: employee.isAdmin
      }
    });
  } catch (error) {
    return fail("No fue posible cambiar PIN", 400, String(error));
  }
}
