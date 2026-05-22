import { z } from "zod";

import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { ensurePinAvailable, requireAdminFromRequest } from "@/server/services/authService";
import { writeAuditEvent } from "@/server/services/auditLog";
import { ensureSystemBootstrapped } from "@/server/system/bootstrap";

const createSchema = z.object({
  name: z.string().min(2),
  pin: z.string().length(4),
  isAdmin: z.boolean().default(false)
});

export async function GET(request: Request) {
  await ensureSystemBootstrapped();
  try {
    await requireAdminFromRequest(request);
    const employees = await prisma.employee.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" }
    });
    return ok({ employees });
  } catch (error) {
    return fail("No autorizado", 403, String(error));
  }
}

export async function POST(request: Request) {
  await ensureSystemBootstrapped();
  try {
    const admin = await requireAdminFromRequest(request);
    const payload = createSchema.parse(await request.json());
    await ensurePinAvailable(payload.pin);
    const employee = await prisma.employee.create({
      data: payload
    });
    await writeAuditEvent({
      type: "role_changed",
      actorEmployeeId: admin.id,
      payload: {
        action: "employee_created",
        employeeId: employee.id,
        isAdmin: employee.isAdmin,
        isActive: employee.isActive
      }
    });
    return ok({ employee }, 201);
  } catch (error) {
    return fail("No fue posible crear empleado", 403, String(error));
  }
}
