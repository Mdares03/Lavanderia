"use client";

import { useState } from "react";

import { formatCurrency, formatDateTime } from "@/lib/format";
import type { Machine } from "@/components/pos/types";

type RunningModalProps = {
  machine: Machine;
  onCancel: () => void;
  onAddTime: (transactionId: string, extraMinutes: number, extraAmountCents: number) => Promise<void>;
};

export function RunningModal({ machine, onCancel, onAddTime }: RunningModalProps) {
  const [extraMinutes, setExtraMinutes] = useState(10);
  const [extraAmount, setExtraAmount] = useState(20);
  const [submitting, setSubmitting] = useState(false);
  if (!machine.transaction) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5">
        <h3 className="text-xl font-bold">{machine.name}</h3>
        <p className="text-sm text-slate-500">Ticket #{machine.transaction.ticketNumber}</p>
        <p className="text-sm text-slate-500">Cliente: {machine.transaction.customerName}</p>
        <p className="text-sm text-slate-500">Inicio: {formatDateTime(machine.transaction.startedAt)}</p>
        <p className="text-sm text-slate-500">Fin esperado: {formatDateTime(machine.transaction.expectedEndAt)}</p>
        <p className="mt-2 text-base font-semibold text-slate-900">Importe: {formatCurrency(machine.transaction.amountCents)}</p>
        {machine.transaction.loyaltyDiscountApplied && (
          <p className="text-xs text-emerald-700">Incluye descuento de lealtad</p>
        )}
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1">
            <span className="text-sm text-slate-600">Agregar minutos</span>
            <input
              type="number"
              min={1}
              value={extraMinutes}
              onChange={(event) => setExtraMinutes(Number(event.target.value || 1))}
              className="rounded-xl border border-slate-300 px-4 py-3 text-xl"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm text-slate-600">Cargo adicional (MXN)</span>
            <input
              type="number"
              min={0}
              value={extraAmount}
              onChange={(event) => setExtraAmount(Number(event.target.value || 0))}
              className="rounded-xl border border-slate-300 px-4 py-3 text-xl"
            />
          </label>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button onClick={onCancel} className="rounded-xl bg-slate-200 px-4 py-3 font-semibold text-slate-700">
            Cerrar
          </button>
          <button
            onClick={async () => {
              setSubmitting(true);
              try {
                await onAddTime(machine.transaction!.id, extraMinutes, extraAmount * 100);
              } finally {
                setSubmitting(false);
              }
            }}
            className="rounded-xl bg-blue-700 px-4 py-3 font-semibold text-white"
            disabled={submitting}
          >
            Agregar tiempo
          </button>
        </div>
      </div>
    </div>
  );
}
