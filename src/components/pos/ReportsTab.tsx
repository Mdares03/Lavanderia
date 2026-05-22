"use client";

import { useState, type ReactNode } from "react";

import type { DashboardTransaction, KpiReport, OwnerBrief, ReportSummary, UtilizationRow } from "@/components/pos/types";
import { formatCurrency, formatDateTime } from "@/lib/format";

type ReportViewMode = "reportes" | "graficas";

type ReportsTabProps = {
  mode: ReportViewMode;
  reportFrom: string;
  reportTo: string;
  reportPeriod: "today" | "yesterday" | "last_7" | "this_month" | "custom";
  setReportFrom: (value: string) => void;
  setReportTo: (value: string) => void;
  setReportPeriod: (value: "today" | "yesterday" | "last_7" | "this_month" | "custom") => void;
  summary: ReportSummary | null;
  utilization: UtilizationRow[];
  kpiReport: KpiReport | null;
  ownerBrief: OwnerBrief | null;
  transactions: DashboardTransaction[];
  onSelectTransaction: (transactionId: string) => void;
  onLoad: () => Promise<void>;
  onExport: () => Promise<void>;
};

type ValuePoint = {
  label: string;
  value: number;
};

function shortDate(isoDate: string) {
  const d = new Date(`${isoDate}T00:00:00`);
  return d.toLocaleDateString("es-MX", { month: "short", day: "numeric" });
}

function hourLabel(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function normalizeHourSeries<T>(rows: T[], getHour: (row: T) => number, getValue: (row: T) => number) {
  const map = new Map(rows.map((row) => [getHour(row), getValue(row)]));
  return Array.from({ length: 24 }, (_, hour) => ({ label: hourLabel(hour), value: map.get(hour) ?? 0 }));
}

function GraphCard({ title, children, compact = false }: { title: string; children: ReactNode; compact?: boolean }) {
  return (
    <article className={`rounded-2xl bg-white shadow-sm ${compact ? "p-4" : "p-5"}`}>
      <h3 className={`${compact ? "text-base" : "text-lg"} font-bold text-slate-900`}>{title}</h3>
      <div className="mt-3">{children}</div>
    </article>
  );
}

function EmptyGraph() {
  return <p className="text-sm text-slate-500">Sin datos reales en el periodo.</p>;
}

function MiniBars({ points, color = "#0f766e" }: { points: ValuePoint[]; color?: string }) {
  if (points.length === 0) {
    return <EmptyGraph />;
  }
  const sample = points.slice(-10);
  const max = Math.max(...sample.map((point) => point.value), 1);

  return (
    <div className="flex h-16 items-end gap-1 rounded-lg bg-slate-50 p-2">
      {sample.map((point) => (
        <div
          key={point.label}
          className="min-w-0 flex-1 rounded-t"
          style={{ height: `${Math.max(10, (point.value / max) * 100)}%`, backgroundColor: color }}
          title={`${point.label}: ${point.value}`}
        />
      ))}
    </div>
  );
}

function BarChart({ points, color = "#0f766e", valueFormatter }: { points: ValuePoint[]; color?: string; valueFormatter?: (n: number) => string }) {
  if (points.length === 0) {
    return <EmptyGraph />;
  }

  const max = Math.max(...points.map((point) => point.value), 1);
  return (
    <div className="space-y-2">
      {points.map((point) => (
        <div key={point.label} className="grid grid-cols-[80px_1fr_auto] items-center gap-2 text-xs">
          <span className="truncate text-slate-600">{point.label}</span>
          <div className="h-4 rounded bg-slate-100">
            <div className="h-4 rounded" style={{ width: `${(point.value / max) * 100}%`, backgroundColor: color }} />
          </div>
          <span className="font-semibold text-slate-700">{valueFormatter ? valueFormatter(point.value) : point.value}</span>
        </div>
      ))}
    </div>
  );
}

function LineChart({ points, stroke = "#1d4ed8", valueFormatter }: { points: ValuePoint[]; stroke?: string; valueFormatter?: (n: number) => string }) {
  if (points.length === 0) {
    return <EmptyGraph />;
  }

  const width = 640;
  const height = 220;
  const padX = 40;
  const padY = 20;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const max = Math.max(...points.map((point) => point.value), 1);

  const path = points
    .map((point, idx) => {
      const x = padX + (idx / Math.max(points.length - 1, 1)) * innerW;
      const y = padY + innerH - (point.value / max) * innerH;
      return `${idx === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
        <line x1={padX} y1={height - padY} x2={width - padX} y2={height - padY} stroke="#cbd5e1" />
        <line x1={padX} y1={padY} x2={padX} y2={height - padY} stroke="#cbd5e1" />
        <path d={path} fill="none" stroke={stroke} strokeWidth="3" />
      </svg>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600 sm:grid-cols-4 lg:grid-cols-6">
        {points.map((point) => (
          <div key={point.label} className="truncate">
            {point.label}: {valueFormatter ? valueFormatter(point.value) : point.value}
          </div>
        ))}
      </div>
    </div>
  );
}

function StackedMixChart({
  points,
  keys,
  colors,
  labels,
  valueFormatter
}: {
  points: Array<{ date: string; [key: string]: number | string }>;
  keys: string[];
  colors: Record<string, string>;
  labels: Record<string, string>;
  valueFormatter?: (n: number) => string;
}) {
  if (points.length === 0) {
    return <EmptyGraph />;
  }

  return (
    <div className="space-y-3">
      {points.map((point) => {
        const total = keys.reduce((sum, key) => sum + Number(point[key] ?? 0), 0);
        return (
          <div key={String(point.date)} className="grid grid-cols-[90px_1fr_auto] items-center gap-2 text-xs">
            <span className="text-slate-600">{shortDate(String(point.date))}</span>
            <div className="flex h-4 overflow-hidden rounded bg-slate-100">
              {keys.map((key) => {
                const value = Number(point[key] ?? 0);
                const pct = total > 0 ? (value / total) * 100 : 0;
                return <div key={key} style={{ width: `${pct}%`, backgroundColor: colors[key] }} title={`${labels[key]}: ${value}`} />;
              })}
            </div>
            <span className="font-semibold text-slate-700">{valueFormatter ? valueFormatter(total) : total}</span>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-2 text-xs">
        {keys.map((key) => (
          <span key={key} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-slate-700">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors[key] }} />
            {labels[key]}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ReportsTab({
  mode,
  reportFrom,
  reportTo,
  reportPeriod,
  setReportFrom,
  setReportTo,
  setReportPeriod,
  summary,
  utilization,
  kpiReport,
  ownerBrief,
  transactions,
  onSelectTransaction,
  onLoad,
  onExport
}: ReportsTabProps) {
  const [selectedGraphId, setSelectedGraphId] = useState<string>("sales_by_hour");

  const salesByHourPoints = kpiReport
    ? normalizeHourSeries(kpiReport.kpis.salesByHour, (row) => row.hour, (row) => row.amountCents)
    : [];

  const cyclesByHourPoints = kpiReport
    ? normalizeHourSeries(kpiReport.kpis.demandByHour, (row) => row.hour, (row) => row.cycles)
    : [];

  const dailySalesPoints = kpiReport
    ? kpiReport.kpis.dailySales.map((row) => ({ label: shortDate(row.date), value: row.amountCents }))
    : [];

  const cyclesByMachinePoints = kpiReport
    ? kpiReport.kpis.cyclesByMachine.slice(0, 12).map((row) => ({ label: row.machineName, value: row.cycles }))
    : [];

  const downtimeTimelinePoints = ownerBrief
    ? ownerBrief.availabilityTimeline.map((incident) => {
        const derivedMinutes =
          incident.minutes ??
          (incident.endedAt
            ? Math.max(0, Math.round((new Date(incident.endedAt).getTime() - new Date(incident.startedAt).getTime()) / 60_000))
            : 0);
        return {
          label: `${incident.relayChannel ?? "-"} ${incident.reasonCode}`,
          value: derivedMinutes
        };
      })
    : [];

  const graphCards = [
    {
      id: "sales_by_hour",
      title: "Ventas por hora",
      points: salesByHourPoints,
      color: "#0f766e",
      summary: kpiReport ? formatCurrency(kpiReport.kpis.totalRevenueCents) : "—"
    },
    {
      id: "daily_sales",
      title: "Tendencia diaria",
      points: dailySalesPoints,
      color: "#1d4ed8",
      summary: kpiReport ? `${kpiReport.kpis.dailySales.length} dias` : "—"
    },
    {
      id: "cycles_by_hour",
      title: "Ciclos por hora",
      points: cyclesByHourPoints,
      color: "#7c3aed",
      summary: kpiReport ? `${kpiReport.kpis.transactionCount} transacciones` : "—"
    },
    {
      id: "cycles_by_machine",
      title: "Ciclos por maquina",
      points: cyclesByMachinePoints,
      color: "#334155",
      summary: kpiReport ? `${kpiReport.kpis.cyclesByMachine.length} maquinas` : "—"
    },
    {
      id: "downtime",
      title: "Downtime",
      points: downtimeTimelinePoints,
      color: "#dc2626",
      summary: ownerBrief ? `${ownerBrief.exceptions.totalDowntimeMinutes} min` : "—"
    }
  ];

  const selectedGraph = graphCards.find((graph) => graph.id === selectedGraphId) ?? graphCards[0] ?? null;

  const renderDrilldownGraph = () => {
    if (!kpiReport || !selectedGraph) {
      return <EmptyGraph />;
    }

    if (selectedGraph.id === "sales_by_hour") {
      return <BarChart points={salesByHourPoints} color="#0f766e" valueFormatter={(value) => formatCurrency(value)} />;
    }
    if (selectedGraph.id === "daily_sales") {
      return <LineChart points={dailySalesPoints} stroke="#1d4ed8" valueFormatter={(value) => formatCurrency(value)} />;
    }
    if (selectedGraph.id === "cycles_by_hour") {
      return <BarChart points={cyclesByHourPoints} color="#7c3aed" valueFormatter={(value) => `${value}`} />;
    }
    if (selectedGraph.id === "cycles_by_machine") {
      return <BarChart points={cyclesByMachinePoints} color="#334155" valueFormatter={(value) => `${value}`} />;
    }
    if (selectedGraph.id === "downtime") {
      return <BarChart points={downtimeTimelinePoints} color="#dc2626" valueFormatter={(value) => `${value} min`} />;
    }
    return <EmptyGraph />;
  };

  return (
    <section className="grid gap-4">
      <article className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-bold text-slate-900">Rango</h2>
          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
            Vista: {mode === "graficas" ? "Graficas" : "Reportes"}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <select
            value={reportPeriod}
            onChange={(event) => setReportPeriod(event.target.value as ReportsTabProps["reportPeriod"])}
            className="rounded-xl border border-slate-300 px-3 py-2"
          >
            <option value="today">Hoy</option>
            <option value="yesterday">Ayer</option>
            <option value="last_7">Ultimos 7 dias</option>
            <option value="this_month">Este mes</option>
            <option value="custom">Personalizado</option>
          </select>
          <input
            type="datetime-local"
            value={reportFrom}
            onChange={(event) => setReportFrom(event.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2"
            disabled={reportPeriod !== "custom"}
          />
          <input
            type="datetime-local"
            value={reportTo}
            onChange={(event) => setReportTo(event.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2"
            disabled={reportPeriod !== "custom"}
          />
          <button onClick={onLoad} className="rounded-xl bg-teal-700 px-4 py-2 font-semibold text-white">
            Actualizar
          </button>
          <button onClick={onExport} className="rounded-xl bg-slate-700 px-4 py-2 font-semibold text-white">
            Exportar CSV
          </button>
        </div>
      </article>

      {mode === "graficas" && (
        <>
          {kpiReport && (
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {graphCards.map((graph) => (
                <GraphCard key={graph.id} title={graph.title} compact>
                  <div className="space-y-3">
                    <MiniBars points={graph.points} color={graph.color} />
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-slate-600">{graph.summary}</p>
                      <button
                        onClick={() => setSelectedGraphId(graph.id)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                          selectedGraphId === graph.id ? "bg-teal-700 text-white" : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        Ver detalle
                      </button>
                    </div>
                  </div>
                </GraphCard>
              ))}
            </section>
          )}

          <GraphCard title={selectedGraph ? `Detalle: ${selectedGraph.title}` : "Detalle"}>{renderDrilldownGraph()}</GraphCard>

          {kpiReport && (
            <section className="grid gap-4 lg:grid-cols-2">
              <GraphCard title="Mix de servicios">
                <StackedMixChart
                  points={kpiReport.kpis.serviceMixByDay}
                  keys={["autoservicio", "encargo", "xl"]}
                  colors={{ autoservicio: "#0284c7", encargo: "#16a34a", xl: "#a855f7" }}
                  labels={{ autoservicio: "Autoservicio", encargo: "Encargo", xl: "XL" }}
                  valueFormatter={(value) => formatCurrency(value)}
                />
              </GraphCard>

              <GraphCard title="Mix de pagos">
                <StackedMixChart
                  points={kpiReport.kpis.paymentMixByDay}
                  keys={["cash", "card", "transfer"]}
                  colors={{ cash: "#f59e0b", card: "#2563eb", transfer: "#14b8a6" }}
                  labels={{ cash: "Cash", card: "Card", transfer: "Transfer" }}
                  valueFormatter={(value) => formatCurrency(value)}
                />
              </GraphCard>
            </section>
          )}
        </>
      )}

      {mode === "reportes" && (
        <>
          {kpiReport && (
            <article className="rounded-2xl bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xl font-bold text-slate-900">KPIs Reales</h2>
                {kpiReport.comparison.limitedHistory && (
                  <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">Limited history</span>
                )}
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <p>Ventas: {formatCurrency(kpiReport.kpis.totalRevenueCents)}</p>
                <p>Transacciones: {kpiReport.kpis.transactionCount}</p>
                <p>Ticket promedio: {kpiReport.kpis.avgTicketCents !== null ? formatCurrency(kpiReport.kpis.avgTicketCents) : "—"}</p>
              </div>
              <div className="mt-2 text-sm text-slate-700">
                {kpiReport.comparison.deltaRevenuePct === null ? (
                  <p>Comparacion: — ({kpiReport.comparison.message ?? "no baseline yet"})</p>
                ) : (
                  <p>Delta ventas vs baseline real: {kpiReport.comparison.deltaRevenuePct}%</p>
                )}
              </div>
              <div className="mt-3 grid gap-1 text-sm">
                {kpiReport.kpis.avgTicketByService.map((row) => (
                  <p key={row.serviceType}>
                    Ticket {row.serviceType}: {row.avgTicketCents !== null ? formatCurrency(row.avgTicketCents) : "—"}
                  </p>
                ))}
              </div>
            </article>
          )}

          {ownerBrief && (
            <article className="rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="text-xl font-bold text-slate-900">Owner Brief</h2>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <p>Safe esperado: {formatCurrency(ownerBrief.cashControl.safeExpectedBalanceCents)}</p>
                <p>Drops periodo: {ownerBrief.cashControl.cashDropsCount}</p>
                <p>Monto en drops: {formatCurrency(ownerBrief.cashControl.cashDroppedCents)}</p>
                <p>Anuladas: {ownerBrief.exceptions.voidedCount}</p>
                <p>Relay fallidas: {ownerBrief.exceptions.relayFailureCount}</p>
                <p>Incidentes disponibilidad: {ownerBrief.exceptions.availabilityIncidentsCount}</p>
                <p>Downtime total: {ownerBrief.exceptions.totalDowntimeMinutes} min</p>
                <p>Encargos listos sin recoger: {ownerBrief.encargoSummary.readyNotCollectedCount}</p>
              </div>
            </article>
          )}

          {summary && (
            <article className="rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="text-xl font-bold text-slate-900">Resumen</h2>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <p>Total: {formatCurrency(summary.totals.totalRevenueCents)}</p>
                <p>Transacciones: {summary.totals.transactionCount}</p>
                <p>Ticket promedio: {formatCurrency(summary.totals.avgTicketCents)}</p>
              </div>
              <div className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                Anuladas: {summary.totals.voidedCount} ({formatCurrency(summary.totals.voidedTotalCents)}) - no incluidas en total.
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

          <article className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900">Historial de transacciones</h2>
            <p className="mt-1 text-xs text-slate-500">Incluye activas, completadas y anuladas (marcadas).</p>
            <div className="mt-3 max-h-80 overflow-y-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <th className="px-3 py-2">Hora</th>
                    <th className="px-3 py-2">Maquina</th>
                    <th className="px-3 py-2">Pago</th>
                    <th className="px-3 py-2">Estatus</th>
                    <th className="px-3 py-2">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="border-t border-slate-100">
                      <td className="px-3 py-2">{formatDateTime(tx.createdAt)}</td>
                      <td className="px-3 py-2">{tx.machine.name}</td>
                      <td className="px-3 py-2">{tx.paymentMethod}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tx.status === "voided" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-700"}`}>
                          {tx.status}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <button onClick={() => onSelectTransaction(tx.id)} className="font-semibold text-teal-700 underline">
                          {formatCurrency(tx.amountCents)}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {transactions.length === 0 && (
                    <tr>
                      <td className="px-3 py-2 text-slate-500" colSpan={5}>
                        Sin transacciones en el rango.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </>
      )}
    </section>
  );
}
