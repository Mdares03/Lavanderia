import { fail, ok } from "@/lib/http";
import { getActiveShift, getShiftSummary } from "@/server/services/shiftService";
import { loginWithPin } from "@/server/services/authService";
import { ensureSystemBootstrapped } from "@/server/system/bootstrap";

function sanitizeSummaryForCashier(summary: Awaited<ReturnType<typeof getShiftSummary>>) {
  return {
    ...summary,
    totals: {
      ...summary.totals,
      expectedCashCents: null
    },
    drawerControl: {
      ...summary.drawerControl,
      currentCashCents: null
    }
  };
}

export async function GET(request: Request) {
  await ensureSystemBootstrapped();
  try {
    const pin = request.headers.get("x-session-pin")?.trim();
    const viewer = pin ? await loginWithPin(pin).catch(() => null) : null;
    const shift = await getActiveShift();
    if (!shift) {
      return ok({ shift: null, summary: null });
    }
    const summary = await getShiftSummary(shift.id);
    const canViewCashExpected = viewer?.isAdmin ?? false;
    return ok({ shift, summary: canViewCashExpected ? summary : sanitizeSummaryForCashier(summary) });
  } catch (error) {
    return fail("No fue posible cargar turno activo", 400, String(error));
  }
}
