"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { apiFetch } from "@/components/pos/api";
import type { ActiveShiftPayload, Employee, ShiftHistoryItem } from "@/components/pos/types";
import { formatCurrency, formatDateTime } from "@/lib/format";

type ShiftTabProps = {
  employee: Employee;
  adminPin: string | null;
  activeShift: ActiveShiftPayload;
  onRefresh: () => Promise<void>;
  onError: (value: string) => void;
  onShiftClosed: () => void;
};

function paymentLabel(value: string) {
  if (value === "card") {
    return "Tarjeta";
  }
  if (value === "transfer") {
    return "Transferencia";
  }
  return "Efectivo";
}

function printShiftSummary(summary: ActiveShiftPayload["summary"], cashierName: string) {
  if (!summary) {
    return;
  }
  const html = `
    <html>
      <head>
        <title>Corte de Caja</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; color: #0f172a; }
          h1 { margin-bottom: 8px; }
          p { margin: 4px 0; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th, td { border: 1px solid #cbd5e1; padding: 6px; text-align: left; font-size: 12px; }
        </style>
      </head>
      <body>
        <h1>Corte de Caja</h1>
        <p>Cajero: ${cashierName}</p>
        <p>Generado: ${new Date().toLocaleString("es-MX")}</p>
        <p>Total ventas: ${formatCurrency(summary.totals.totalSalesCents)}</p>
        <p>Transacciones: ${summary.totals.transactionCount}</p>
        <p>Anuladas: ${summary.totals.voidedCount} (${formatCurrency(summary.totals.voidedTotalCents)})</p>
        <p>Efectivo esperado: ${formatCurrency(summary.totals.expectedCashCents)}</p>
      </body>
    </html>
  `;

  const printWindow = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
  if (!printWindow) {
    return;
  }
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function exportShiftSummary(summary: ActiveShiftPayload["summary"], cashierName: string) {
  if (!summary) {
    return;
  }
  const lines = [
    `Corte de Caja - ${new Date().toLocaleString("es-MX")}`,
    `Cajero: ${cashierName}`,
    `Ventas: ${formatCurrency(summary.totals.totalSalesCents)}`,
    `Transacciones: ${summary.totals.transactionCount}`,
    `Anuladas: ${summary.totals.voidedCount} (${formatCurrency(summary.totals.voidedTotalCents)})`,
    `Efectivo esperado: ${formatCurrency(summary.totals.expectedCashCents)}`
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `corte-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function ShiftTab({ employee, adminPin, activeShift, onRefresh, onError, onShiftClosed }: ShiftTabProps) {
  const [startingCash, setStartingCash] = useState(0);
  const [movementAmount, setMovementAmount] = useState(0);
  const [movementReason, setMovementReason] = useState("");
  const [actualCash, setActualCash] = useState(0);
  const [closing, setClosing] = useState(false);
  const [historyFrom, setHistoryFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [historyTo, setHistoryTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [history, setHistory] = useState<ShiftHistoryItem[]>([]);

  const expectedCashCents = activeShift.summary?.totals.expectedCashCents ?? 0;
  const countedCashCents = Math.round(actualCash * 100);
  const differenceCents = countedCashCents - expectedCashCents;
  const differenceLabel = differenceCents >= 0 ? "Sobrante" : "Faltante";

  const paymentBreakdown = useMemo(() => {
    const rows = activeShift.summary?.totals.byPaymentMethod ?? [];
    return rows.slice().sort((a, b) => a.paymentMethod.localeCompare(b.paymentMethod));
  }, [activeShift.summary?.totals.byPaymentMethod]);

  const loadHistory = useCallback(async () => {
    if (!adminPin || !employee.isAdmin) {
      setHistory([]);
      return;
    }
    try {
      const fromDate = new Date(`${historyFrom}T00:00:00`);
      const toDate = new Date(`${historyTo}T23:59:59`);
      const query = `from=${encodeURIComponent(fromDate.toISOString())}&to=${encodeURIComponent(toDate.toISOString())}`;
      const payload = await apiFetch<{ shifts: ShiftHistoryItem[] }>(`/api/shifts/history?${query}`, {
        headers: {
          "x-admin-pin": adminPin
        }
      });
      setHistory(payload.shifts);
    } catch (error) {
      onError(error instanceof Error ? error.message : "No fue posible cargar historial de cortes");
    }
  }, [adminPin, employee.isAdmin, historyFrom, historyTo, onError]);

  useEffect(() => {
    loadHistory().catch(() => undefined);
  }, [loadHistory]);

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
            placeholder="Caja inicial"
          />
          <button
            onClick={async () => {
              try {
                await apiFetch("/api/shifts/open", {
                  method: "POST",
                  body: JSON.stringify({
                    employeeId: employee.id,
                    startingCashCents: Math.round(startingCash * 100)
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
    <section className="grid gap-4">
      <article className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900">Turno Activo</h2>
        <p className="text-sm text-slate-600">Inicio: {formatDateTime(activeShift.shift.startTime)}</p>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <p>Ventas: {formatCurrency(activeShift.summary.totals.totalSalesCents)}</p>
          <p>Transacciones: {activeShift.summary.totals.transactionCount}</p>
          <p>Efectivo esperado: {formatCurrency(activeShift.summary.totals.expectedCashCents)}</p>
          <p>Anuladas: {activeShift.summary.totals.voidedCount}</p>
          <p>Valor anulado: {formatCurrency(activeShift.summary.totals.voidedTotalCents)}</p>
          <p>Ventas en efectivo: {formatCurrency(activeShift.summary.totals.cashSalesCents)}</p>
        </div>
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <h3 className="text-sm font-semibold text-slate-800">Desglose por metodo de pago</h3>
          <ul className="mt-2 grid gap-1 text-sm">
            {paymentBreakdown.map((row) => (
              <li key={row.paymentMethod}>
                {paymentLabel(row.paymentMethod)}: {formatCurrency(row.amountCents)} ({row.count})
              </li>
            ))}
          </ul>
        </div>
      </article>

      <article className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900">Movimientos de Caja</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_2fr_auto_auto]">
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
              if (movementAmount <= 0 || movementReason.trim().length < 3) {
                onError("Ingresa monto y motivo");
                return;
              }
              try {
                await apiFetch("/api/shifts/movements", {
                  method: "POST",
                  body: JSON.stringify({
                    shiftId: activeShift.shift!.id,
                    employeeId: employee.id,
                    type: "deposit",
                    amountCents: Math.round(movementAmount * 100),
                    reason: movementReason.trim()
                  })
                });
                setMovementAmount(0);
                setMovementReason("");
                await onRefresh();
              } catch (error) {
                onError(error instanceof Error ? error.message : "No fue posible registrar deposito");
              }
            }}
            className="rounded-xl bg-emerald-700 px-4 py-3 font-semibold text-white"
          >
            Registrar deposito
          </button>
          <button
            onClick={async () => {
              if (movementAmount <= 0 || movementReason.trim().length < 3) {
                onError("Ingresa monto y motivo");
                return;
              }
              try {
                await apiFetch("/api/shifts/movements", {
                  method: "POST",
                  body: JSON.stringify({
                    shiftId: activeShift.shift!.id,
                    employeeId: employee.id,
                    type: "withdrawal",
                    amountCents: Math.round(movementAmount * 100),
                    reason: movementReason.trim()
                  })
                });
                setMovementAmount(0);
                setMovementReason("");
                await onRefresh();
              } catch (error) {
                onError(error instanceof Error ? error.message : "No fue posible registrar retiro");
              }
            }}
            className="rounded-xl bg-amber-600 px-4 py-3 font-semibold text-white"
          >
            Registrar retiro
          </button>
        </div>
        <div className="mt-3 max-h-48 overflow-y-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="px-3 py-2">Hora</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Monto</th>
                <th className="px-3 py-2">Motivo</th>
              </tr>
            </thead>
            <tbody>
              {activeShift.summary.cashMovements.map((movement) => (
                <tr key={movement.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{formatDateTime(movement.createdAt)}</td>
                  <td className="px-3 py-2">{movement.type === "deposit" ? "Deposito" : "Retiro"}</td>
                  <td className="px-3 py-2">{formatCurrency(movement.amountCents)}</td>
                  <td className="px-3 py-2">{movement.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <article className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900">Anulaciones del turno</h2>
        <ul className="mt-2 grid gap-1 text-xs text-slate-600">
          {activeShift.summary.totals.voidedByEmployee.map((row) => (
            <li key={row.employeeId}>
              {row.employeeName}: {row.count} anulaciones ({formatCurrency(row.amountCents)})
            </li>
          ))}
          {activeShift.summary.totals.voidedByEmployee.length === 0 && <li>Sin anulaciones registradas.</li>}
        </ul>
        <div className="mt-3 max-h-48 overflow-y-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="px-3 py-2">Hora</th>
                <th className="px-3 py-2">Ticket</th>
                <th className="px-3 py-2">Maquina</th>
                <th className="px-3 py-2">Monto</th>
                <th className="px-3 py-2">Motivo</th>
                <th className="px-3 py-2">Empleado</th>
              </tr>
            </thead>
            <tbody>
              {activeShift.summary.voidedTransactions.map((tx) => (
                <tr key={tx.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{formatDateTime(tx.voidedAt)}</td>
                  <td className="px-3 py-2">#{tx.ticketNumber}</td>
                  <td className="px-3 py-2">{tx.machineName}</td>
                  <td className="px-3 py-2">{formatCurrency(tx.amountCents)}</td>
                  <td className="px-3 py-2">{tx.reason || "-"}</td>
                  <td className="px-3 py-2">{tx.employeeName}</td>
                </tr>
              ))}
              {activeShift.summary.voidedTransactions.length === 0 && (
                <tr>
                  <td className="px-3 py-2 text-slate-500" colSpan={6}>
                    Sin anulaciones en este turno.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      <article className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900">Cerrar Turno</h2>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <p>Caja inicial: {formatCurrency(activeShift.shift.startingCashCents)}</p>
          <p>Ventas efectivo: {formatCurrency(activeShift.summary.totals.cashSalesCents)}</p>
          <p>Depositos: {formatCurrency(activeShift.summary.totals.depositsCents)}</p>
          <p>Retiros: {formatCurrency(activeShift.summary.totals.withdrawalsCents)}</p>
        </div>
        <p className="mt-2 text-sm font-semibold">Efectivo esperado: {formatCurrency(activeShift.summary.totals.expectedCashCents)}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            type="number"
            min={0}
            value={actualCash}
            onChange={(event) => setActualCash(Number(event.target.value || 0))}
            className="rounded-xl border border-slate-300 px-4 py-3 text-xl"
            placeholder="Efectivo contado"
          />
          <p className={`text-sm font-semibold ${differenceCents >= 0 ? "text-emerald-700" : "text-red-700"}`}>
            {differenceLabel}: {formatCurrency(Math.abs(differenceCents))}
          </p>
          <button
            disabled={closing}
            onClick={async () => {
              setClosing(true);
              try {
                const payload = await apiFetch<{ shift: unknown; summary: ActiveShiftPayload["summary"] }>("/api/shifts/close", {
                  method: "POST",
                  body: JSON.stringify({
                    shiftId: activeShift.shift!.id,
                    actualCashCents: countedCashCents
                  })
                });
                printShiftSummary(payload.summary, employee.name);
                exportShiftSummary(payload.summary, employee.name);
                await onRefresh();
                onShiftClosed();
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

      {employee.isAdmin && (
        <article className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">Historial de cortes</h2>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={historyFrom}
              onChange={(event) => setHistoryFrom(event.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2"
            />
            <input
              type="date"
              value={historyTo}
              onChange={(event) => setHistoryTo(event.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2"
            />
            <button onClick={() => loadHistory().catch(() => undefined)} className="rounded-xl bg-slate-700 px-4 py-2 font-semibold text-white">
              Consultar
            </button>
          </div>
          <div className="mt-3 max-h-72 overflow-y-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  <th className="px-3 py-2">Empleado</th>
                  <th className="px-3 py-2">Inicio</th>
                  <th className="px-3 py-2">Fin</th>
                  <th className="px-3 py-2">Ventas</th>
                  <th className="px-3 py-2">Por metodo</th>
                  <th className="px-3 py-2">Anuladas</th>
                  <th className="px-3 py-2">Depositos / Retiros</th>
                  <th className="px-3 py-2">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {history.map((shift) => (
                  <tr key={shift.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">{shift.employee.name}</td>
                    <td className="px-3 py-2">{formatDateTime(shift.startTime)}</td>
                    <td className="px-3 py-2">{shift.endTime ? formatDateTime(shift.endTime) : "Abierto"}</td>
                    <td className="px-3 py-2">{formatCurrency(shift.totals.totalSalesCents)}</td>
                    <td className="px-3 py-2 text-xs">
                      {shift.totals.byPaymentMethod
                        .map((row) => `${paymentLabel(row.paymentMethod)} ${formatCurrency(row.amountCents)}`)
                        .join(" · ")}
                    </td>
                    <td className="px-3 py-2">
                      {shift.totals.voidedCount} ({formatCurrency(shift.totals.voidedTotalCents)})
                    </td>
                    <td className="px-3 py-2">
                      {formatCurrency(shift.totals.depositsCents)} / {formatCurrency(shift.totals.withdrawalsCents)}
                    </td>
                    <td className="px-3 py-2">{shift.differenceCashCents !== null ? formatCurrency(shift.differenceCashCents) : "-"}</td>
                  </tr>
                ))}
                {history.length === 0 && (
                  <tr>
                    <td className="px-3 py-2 text-slate-500" colSpan={8}>
                      Sin cortes en el rango seleccionado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      )}
    </section>
  );
}
