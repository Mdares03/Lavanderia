import "server-only";

import { prisma } from "@/lib/db";

export async function loginWithPin(pin: string) {
  const employee = await prisma.employee.findFirst({
    where: {
      pin,
      isActive: true
    }
  });

  if (!employee) {
    throw new Error("PIN invalido");
  }

  return employee;
}

export function getAdminPinFromRequest(request: Request) {
  return request.headers.get("x-admin-pin")?.trim() ?? "";
}

export async function requireAdminFromRequest(request: Request) {
  const pin = getAdminPinFromRequest(request);
  if (!pin || pin.length !== 4) {
    throw new Error("PIN de administrador requerido");
  }
  const employee = await loginWithPin(pin);
  if (!employee.isAdmin) {
    throw new Error("Permiso denegado: solo administrador");
  }
  return employee;
}
