"use client";

import { useState } from "react";

import { apiFetch } from "@/components/pos/api";
import type { ActiveShiftPayload, Employee } from "@/components/pos/types";
import { formatCurrency, formatDateTime } from "@/lib/format";

type ShiftTabProps = {
  employee: Employee;
  activeShift: ActiveShiftPayload;
  onRefresh: () => Promise<void>;
  onError: (value: string) => void;
};

export function ShiftTab({ employee, activeShift, onRefresh, onError }: ShiftTabProps) {
  const [startingCash, setStartingCash] = useState(0);
  const [movementAmount, setMovementAmount] = useState(0);
  const [movementReason, setMovementReason] = useState("");
  const [movementType, setMovementType] = useState<"deposit" | "withdrawal">("deposit");
  const [actualCash, setActualCash] = useState(0);
  const [closing, setClosing] = useState(false);

  if (!activeShift.shift || !activeShift.summary) {
    return (
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900">Corte de Caja</h2>
        <p className="mt-2 text-sm text-slate-600">No hay turno abierto.</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            type="number"
            min={0}
            value={startingCash}
            onChange={(event) => setStartingCash(Number(event.target.value || 0))}
            className="rounded-xl border border-slate-300 px-4 py-3 text-xl"
          />
          <button
            onClick={async () => {
              try {
                await apiFetch("/api/shifts/open", {
                  method: "POST",
                  body: JSON.stringify({
                    employeeId: employee.id,
                    startingCashCents: startingCash * 100
                  })
                });
                await onRefresh();
              } catch (error) {
                onError(error instanceof Error ? error.message : "No fue posible abrir turno");
              }
            }}
            className="rounded-xl bg-teal-700 px-4 py-3 text-white"
          >
            Abrir Turno
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <article className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900">Turno Activo</h2>
        <p className="text-sm text-slate-600">Inicio: {formatDateTime(activeShift.shift.startTime)}</p>
        <div className="mt-3 grid gap-2 text-sm">
          <p>Ventas: {formatCurrency(activeShift.summary.totals.totalSalesCents)}</p>
          <p>Transacciones: {activeShift.summary.totals.transactionCount}</p>
          <p>Efectivo esperado: {formatCurrency(activeShift.summary.totals.expectedCashCents)}</p>
        </div>
      </article>

      <article className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900">Movimientos de Caja</h2>
        <div className="mt-3 grid gap-2">
          <select
            value={movementType}
            onChange={(event) => setMovementType(event.target.value as "deposit" | "withdrawal")}
            className="rounded-xl border border-slate-300 px-4 py-3"
          >
            <option value="deposit">Deposito</option>
            <option value="withdrawal">Retiro</option>
          </select>
          <input
            type="number"
            min={1}
            value={movementAmount}
            onChange={(event) => setMovementAmount(Number(event.target.value || 0))}
            className="rounded-xl border border-slate-300 px-4 py-3"
            placeholder="Monto"
          />
          <input
            value={movementReason}
            onChange={(event) => setMovementReason(event.target.value)}
            className="rounded-xl border border-slate-300 px-4 py-3"
            placeholder="Motivo"
          />
          <button
            onClick={async () => {
              try {
                await apiFetch("/api/shifts/movements", {
                  method: "POST",
                  body: JSON.stringify({
                    shiftId: activeShift.shift!.id,
                    employeeId: employee.id,
                    type: movementType,
                    amountCents: movementAmount * 100,
                    reason: movementReason
                  })
                });
                await onRefresh();
              } catch (error) {
                onError(error instanceof Error ? error.message : "No fue posible registrar movimiento");
              }
            }}
            className="rounded-xl bg-amber-600 px-4 py-3 font-semibold text-white"
          >
            Registrar movimiento
          </button>
        </div>
      </article>

      <article className="rounded-2xl bg-white p-5 shadow-sm lg:col-span-2">
        <h2 className="text-xl font-bold text-slate-900">Cerrar Turno</h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            type="number"
            min={0}
            value={actualCash}
            onChange={(event) => setActualCash(Number(event.target.value || 0))}
            className="rounded-xl border border-slate-300 px-4 py-3 text-xl"
            placeholder="Efectivo contado"
          />
          <button
            disabled={closing}
            onClick={async () => {
              setClosing(true);
              try {
                await apiFetch("/api/shifts/close", {
                  method: "POST",
                  body: JSON.stringify({
                    shiftId: activeShift.shift!.id,
                    actualCashCents: actualCash * 100
                  })
                });
                await onRefresh();
              } catch (error) {
                onError(error instanceof Error ? error.message : "No fue posible cerrar turno");
              } finally {
                setClosing(false);
              }
            }}
            className="rounded-xl bg-red-700 px-4 py-3 font-semibold text-white"
          >
            Cerrar Turno
          </button>
        </div>
      </article>
    </section>
  );
}
