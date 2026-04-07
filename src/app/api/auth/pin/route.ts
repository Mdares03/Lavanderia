import { z } from "zod";

import { fail, ok } from "@/lib/http";
import { loginWithPin } from "@/server/services/authService";
import { ensureSystemBootstrapped } from "@/server/system/bootstrap";

const schema = z.object({
  pin: z.string().length(4)
});

export async function POST(request: Request) {
  await ensureSystemBootstrapped();
  try {
    const payload = schema.parse(await request.json());
    const employee = await loginWithPin(payload.pin);
    return ok({
      id: employee.id,
      name: employee.name,
      isAdmin: employee.isAdmin
    });
  } catch (error) {
    return fail("No fue posible autenticar empleado", 401, String(error));
  }
}
