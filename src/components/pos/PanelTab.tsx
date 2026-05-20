"use client";

import type { DashboardTransaction, EncargoOrder, Machine, PaymentMethod } from "@/components/pos/types";
import { formatCurrency, formatDateTime, formatMinutes } from "@/lib/format";

type PanelTabProps = {
  machines: Machine[];
  ticker: number;
  recentTransactions: DashboardTransaction[];
  encargoOrders: EncargoOrder[];
  onSelectAvailable: (machineId: string) => void;
  onSelectRunning: (machineId: string) => void;
  onSelectTransaction: (transactionId: string) => void;
  onCreateEncargo: () => void;
  onUpdateEncargoStatus: (input: { orderId: string; status: EncargoOrder["status"]; paymentMethod?: PaymentMethod }) => Promise<void>;
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

function txStatusLabel(status: string) {
  if (status === "running" || status === "pending_relay") {
    return "Activa";
  }
  if (status === "completed") {
    return "Completada";
  }
  if (status === "voided") {
    return "Anulada";
  }
  return status;
}

function encargoStatusLabel(status: EncargoOrder["status"]) {
  if (status === "lavando") return "Lavando";
  if (status === "secando") return "Secando";
  if (status === "doblando") return "Doblando";
  if (status === "listo") return "Listo";
  if (status === "entregado") return "Entregado";
  return "Recibido";
}

export function PanelTab({
  machines,
  ticker,
  recentTransactions,
  encargoOrders,
  onSelectAvailable,
  onSelectRunning,
  onSelectTransaction,
  onCreateEncargo,
  onUpdateEncargoStatus
}: PanelTabProps) {
  const washers = machines.filter((machine) => machine.type === "washer");
  const dryers = machines.filter((machine) => machine.type === "dryer");

  const getSpecialLabel = (machine: Machine) => {
    const upper = machine.name.toUpperCase();
    if (upper.includes("(ENCARGO)")) {
      return "ENCARGO";
    }
    if (upper.includes("(XL)")) {
      return "XL";
    }
    return null;
  };

  const renderMachineButton = (machine: Machine) => {
    const remainingMinutes = machine.transaction
      ? Math.max(0, Math.ceil((new Date(machine.transaction.expectedEndAt).getTime() - ticker) / 60_000))
      : 0;
    const specialLabel = getSpecialLabel(machine);

    const statusClass =
      machine.status === "out_of_service"
        ? "border-2 border-slate-500 bg-slate-700 text-white"
        : machine.status === "running"
          ? machine.type === "washer"
            ? "border-2 border-indigo-300 bg-indigo-800 text-white shadow-lg"
            : "border-2 border-rose-300 bg-rose-800 text-white shadow-lg"
          : machine.status === "finished"
            ? "border-2 border-amber-400 bg-amber-300 text-amber-950 shadow-lg animate-finish-pulse"
            : machine.type === "washer"
              ? "border-2 border-cyan-300 bg-cyan-100 text-cyan-950"
              : "border-2 border-amber-300 bg-amber-100 text-amber-950";

    return (
      <button
        key={machine.id}
        onClick={() => {
          if (machine.status === "available") {
            onSelectAvailable(machine.id);
          }
          if (machine.status === "running" || machine.status === "finished") {
            onSelectRunning(machine.id);
          }
        }}
        className={`${statusClass} min-h-28 rounded-xl p-3 text-left transition hover:scale-[1.01]`}
      >
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <p className="text-base font-bold leading-tight">{machine.name}</p>
            <p className="text-xs uppercase tracking-wide">{machine.type === "washer" ? "Lavadora" : "Secadora"}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            {specialLabel && (
              <span className="rounded-full bg-black/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">{specialLabel}</span>
            )}
            <span className="rounded-full bg-black/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
              {machine.status === "running"
                ? "En marcha"
                : machine.status === "finished"
                  ? "Ciclo terminado"
                  : machine.status === "available"
                    ? "Lista"
                    : "Fuera"}
            </span>
          </div>
        </div>
        {(machine.status === "running" || machine.status === "finished") && machine.transaction && (
          <>
            <p className="text-2xl font-bold">{remainingMinutes} min</p>
            <p className="text-xs">Ticket #{machine.transaction.ticketNumber}</p>
            <p className="text-xs">{machine.transaction.customerName}</p>
            <p className="text-xs">{formatCurrency(machine.transaction.amountCents)}</p>
            {machine.status === "finished" && <p className="mt-1 text-xs font-semibold">Tap para liberar</p>}
          </>
        )}
        {machine.status === "available" && (
          <>
            <p className="text-lg font-bold">Disponible</p>
            <p className="text-xs">Tap para activar</p>
          </>
        )}
        {machine.status === "out_of_service" && <p className="text-lg font-bold">Fuera de servicio</p>}
      </button>
    );
  };

  return (
    <section className="grid gap-4">
      <article>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-cyan-900">Lavadoras</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">{washers.map(renderMachineButton)}</div>
      </article>
      <article>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-amber-900">Secadoras</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">{dryers.map(renderMachineButton)}</div>
      </article>

      <article className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-base font-bold text-slate-900">Encargos activos</h2>
          <button onClick={onCreateEncargo} className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white">
            Nuevo Encargo
          </button>
        </div>
        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {encargoOrders.length === 0 && <p className="text-sm text-slate-500">No hay encargos activos.</p>}
          {encargoOrders.map((order) => {
            const delayedClass =
              order.status === "listo" && order.readyForHours >= 48
                ? "border-red-300 bg-red-50"
                : order.status === "listo" && order.readyForHours >= 24
                  ? "border-amber-300 bg-amber-50"
                  : "border-slate-200 bg-slate-50";

            return (
              <div key={order.id} className={`rounded-xl border p-3 ${delayedClass}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-slate-900">{order.customerName || order.customerPhone || "Cliente sin datos"}</p>
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold">{encargoStatusLabel(order.status)}</span>
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  {order.weightKg.toFixed(1)} kg · {order.loads} carga(s) · {formatCurrency(order.priceCents)} · {formatMinutes(order.elapsedMinutes)}
                </p>
                {order.activeMachines.length > 0 && (
                  <p className="mt-1 text-xs text-slate-700">En maquina: {order.activeMachines.map((machine) => machine.machineName).join(", ")}</p>
                )}
                {order.notes && <p className="mt-1 text-xs text-slate-600">Notas: {order.notes}</p>}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    onClick={() => onUpdateEncargoStatus({ orderId: order.id, status: "doblando" })}
                    className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Marcar doblando
                  </button>
                  <button
                    onClick={() => onUpdateEncargoStatus({ orderId: order.id, status: "listo" })}
                    className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Marcar listo
                  </button>
                  <button
                    onClick={async () => {
                      if (order.paymentMode === "pickup" && order.paymentStatus !== "paid") {
                        const input = window.prompt("Metodo de pago al entregar: cash, card o transfer", "cash") ?? "";
                        const method = input.trim().toLowerCase();
                        if (method !== "cash" && method !== "card" && method !== "transfer") {
                          return;
                        }
                        await onUpdateEncargoStatus({
                          orderId: order.id,
                          status: "entregado",
                          paymentMethod: method
                        });
                        return;
                      }
                      await onUpdateEncargoStatus({ orderId: order.id, status: "entregado" });
                    }}
                    className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Marcar entregado
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </article>

      <article className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-base font-bold text-slate-900">Transacciones recientes</h2>
        <div className="mt-2 max-h-56 overflow-y-auto">
          <ul className="divide-y divide-slate-100 text-sm">
            {recentTransactions.map((tx) => (
              <li key={tx.id}>
                <button onClick={() => onSelectTransaction(tx.id)} className="grid w-full grid-cols-[auto_1fr_auto] gap-3 px-1 py-2 text-left hover:bg-slate-50">
                  <span className="text-xs text-slate-500">{formatDateTime(tx.createdAt)}</span>
                  <span className="truncate">
                    {tx.machine.name} · {paymentLabel(tx.paymentMethod)} · <span className="font-semibold">{txStatusLabel(tx.status)}</span>
                  </span>
                  <span className="font-semibold text-slate-900">{formatCurrency(tx.amountCents)}</span>
                </button>
              </li>
            ))}
            {recentTransactions.length === 0 && <li className="px-1 py-2 text-xs text-slate-500">Sin transacciones recientes.</li>}
          </ul>
        </div>
      </article>
    </section>
  );
}
