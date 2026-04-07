"use client";

import type { ReportSummary, UtilizationRow } from "@/components/pos/types";
import { formatCurrency } from "@/lib/format";

type ReportsTabProps = {
  reportFrom: string;
  reportTo: string;
  setReportFrom: (value: string) => void;
  setReportTo: (value: string) => void;
  summary: ReportSummary | null;
  utilization: UtilizationRow[];
  onLoad: () => Promise<void>;
  onExport: () => Promise<void>;
};

export function ReportsTab({
  reportFrom,
  reportTo,
  setReportFrom,
  setReportTo,
  summary,
  utilization,
  onLoad,
  onExport
}: ReportsTabProps) {
  return (
    <section className="grid gap-4">
      <article className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900">Rango</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="datetime-local"
            value={reportFrom}
            onChange={(event) => setReportFrom(event.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2"
          />
          <input
            type="datetime-local"
            value={reportTo}
            onChange={(event) => setReportTo(event.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2"
          />
          <button onClick={onLoad} className="rounded-xl bg-teal-700 px-4 py-2 font-semibold text-white">
            Actualizar
          </button>
          <button onClick={onExport} className="rounded-xl bg-slate-700 px-4 py-2 font-semibold text-white">
            Exportar CSV
          </button>
        </div>
      </article>

      {summary && (
        <article className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">Resumen</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <p>Total: {formatCurrency(summary.totals.totalRevenueCents)}</p>
            <p>Transacciones: {summary.totals.transactionCount}</p>
            <p>Ticket promedio: {formatCurrency(summary.totals.avgTicketCents)}</p>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div>
              <h3 className="font-semibold">Por metodo de pago</h3>
              <ul className="mt-2 grid gap-1 text-sm">
                {summary.byPaymentMethod.map((row) => (
                  <li key={row.paymentMethod}>
                    {row.paymentMethod}: {formatCurrency(row.amountCents)} ({row.count})
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-semibold">Por maquina</h3>
              <ul className="mt-2 grid gap-1 text-sm">
                {summary.byMachine.slice(0, 8).map((row) => (
                  <li key={row.machineName}>
                    {row.machineName}: {formatCurrency(row.amountCents)} ({row.count})
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </article>
      )}

      {utilization.length > 0 && (
        <article className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">Utilizacion de maquinas</h2>
          <ul className="mt-3 grid gap-2 text-sm">
            {utilization.map((row) => (
              <li key={row.machineId} className="rounded-lg bg-slate-100 px-3 py-2">
                {row.machineName}: {row.utilizationPct}% ({Math.round(row.usedMinutes)} min)
              </li>
            ))}
          </ul>
        </article>
      )}
    </section>
  );
}
