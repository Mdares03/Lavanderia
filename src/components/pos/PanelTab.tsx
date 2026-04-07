"use client";

import type { Machine } from "@/components/pos/types";
import { formatCurrency } from "@/lib/format";

type PanelTabProps = {
  machines: Machine[];
  ticker: number;
  onSelectAvailable: (machineId: string) => void;
  onSelectRunning: (machineId: string) => void;
};

export function PanelTab({ machines, ticker, onSelectAvailable, onSelectRunning }: PanelTabProps) {
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
          if (machine.status === "running") {
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
              {machine.status === "running" ? "En marcha" : machine.status === "available" ? "Lista" : "Fuera"}
            </span>
          </div>
        </div>
        {machine.status === "running" && machine.transaction && (
          <>
            <p className="text-2xl font-bold">{remainingMinutes} min</p>
            <p className="text-xs">Ticket #{machine.transaction.ticketNumber}</p>
            <p className="text-xs">{machine.transaction.customerName}</p>
            <p className="text-xs">{formatCurrency(machine.transaction.amountCents)}</p>
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
    </section>
  );
}
