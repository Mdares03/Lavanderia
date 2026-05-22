import "server-only";

import { prisma } from "@/lib/db";

export async function loginWithPin(pin: string) {
  const matches = await prisma.employee.findMany({
    where: {
      pin,
      isActive: true
    },
    orderBy: {
      createdAt: "asc"
    }
  });

  if (matches.length === 0) {
    throw new Error("PIN invalido");
  }

  if (matches.length > 1) {
    throw new Error("PIN duplicado detectado. Solicita a un administrador actualizarlo.");
  }

  return matches[0];
}

export async function ensurePinAvailable(pin: string, excludeEmployeeId?: string) {
  const existing = await prisma.employee.findFirst({
    where: {
      pin,
      isActive: true,
      ...(excludeEmployeeId ? { id: { not: excludeEmployeeId } } : {})
    },
    select: {
      id: true
    }
  });

  if (existing) {
    throw new Error("PIN ya en uso por otro empleado activo");
  }
}

export function getAdminPinFromRequest(request: Request) {
  return request.headers.get("x-admin-pin")?.trim() ?? "";
}

export function getSessionPinFromRequest(request: Request) {
  return request.headers.get("x-session-pin")?.trim() ?? "";
}

export async function requireEmployeeFromRequest(request: Request) {
  const pin = getSessionPinFromRequest(request);
  if (!pin || pin.length !== 4) {
    throw new Error("PIN de sesion requerido");
  }
  return loginWithPin(pin);
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
