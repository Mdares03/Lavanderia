"use client";

import { useState } from "react";

import { formatCurrency, formatDateTime } from "@/lib/format";
import type { Machine, PaymentMethod } from "@/components/pos/types";

type RunningModalProps = {
  machine: Machine;
  ticker: number;
  onClose: () => void;
  onAddTime: (input: {
    transactionId: string;
    extraMinutes: number;
    extraAmountCents: number;
    paymentMethod: PaymentMethod;
  }) => Promise<void>;
  onVoidTransaction: (input: { transactionId: string; reason: string; adminPin?: string }) => Promise<void>;
  onReleaseMachine: (machineId: string) => Promise<void>;
};

function paymentLabel(value: PaymentMethod) {
  if (value === "card") {
    return "Tarjeta";
  }
  if (value === "transfer") {
    return "Transferencia";
  }
  return "Efectivo";
}

export function RunningModal({ machine, ticker, onClose, onAddTime, onVoidTransaction, onReleaseMachine }: RunningModalProps) {
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [extraMinutes, setExtraMinutes] = useState(machine.transaction?.originalDurationMinutes ?? machine.defaultDurationMinutes);
  const [extraAmountCents, setExtraAmountCents] = useState(0);
  const [extendPaymentMethod, setExtendPaymentMethod] = useState<PaymentMethod>("cash");
  const [voidReason, setVoidReason] = useState("");
  const [adminPin, setAdminPin] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const transaction = machine.transaction;
  if (!transaction) {
    return null;
  }

  const isRunning = machine.status === "running";
  const isFinished = machine.status === "finished";
  const remainingMinutes = Math.max(0, Math.ceil((new Date(transaction.expectedEndAt).getTime() - ticker) / 60_000));

  const perMinuteRateCents = Math.max(1, Math.round(transaction.amountCents / Math.max(1, transaction.originalDurationMinutes)));

  const openExtend = () => {
    const suggestedMinutes = Math.max(1, transaction.originalDurationMinutes);
    setExtraMinutes(suggestedMinutes);
    setExtraAmountCents(Math.round(suggestedMinutes * perMinuteRateCents));
    setExtendPaymentMethod("cash");
    setShowExtendModal(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-xl rounded-2xl bg-white p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-bold">{machine.name}</h3>
            <p className="text-sm text-slate-500">Ticket #{transaction.ticketNumber}</p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
              isRunning ? "bg-indigo-100 text-indigo-800" : isFinished ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700"
            }`}
          >
            {isRunning ? "En marcha" : isFinished ? "Ciclo terminado" : transaction.status}
          </span>
        </div>

        <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <p className="text-lg font-bold text-slate-900">{remainingMinutes} min restantes</p>
          <p>Cliente: {transaction.customerName}</p>
          <p>Inicio: {formatDateTime(transaction.startedAt)}</p>
          <p>Fin esperado: {formatDateTime(transaction.expectedEndAt)}</p>
          <p>Importe original: {formatCurrency(transaction.amountCents)}</p>
          <p>Pago original: {paymentLabel(transaction.paymentMethod)}</p>
          {transaction.extensionMinutes > 0 && (
            <p className="text-xs text-slate-600">
              Extensiones acumuladas: +{transaction.extensionMinutes} min ({formatCurrency(transaction.extensionAmountCents)})
            </p>
          )}
          {transaction.voidReason && <p className="text-xs text-red-700">Motivo de cancelacion: {transaction.voidReason}</p>}
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {isRunning && (
            <button onClick={openExtend} className="rounded-xl bg-blue-700 px-4 py-3 font-semibold text-white">
              Agregar tiempo
            </button>
          )}
          {isRunning && (
            <button onClick={() => setShowVoidModal(true)} className="rounded-xl bg-red-700 px-4 py-3 font-semibold text-white">
              Cancelar
            </button>
          )}
          {isFinished && (
            <button
              onClick={async () => {
                setSubmitting(true);
                try {
                  await onReleaseMachine(machine.id);
                } finally {
                  setSubmitting(false);
                }
              }}
              className="rounded-xl bg-emerald-700 px-4 py-3 font-semibold text-white"
              disabled={submitting}
            >
              Liberar maquina
            </button>
          )}
          <button onClick={onClose} className="rounded-xl bg-slate-200 px-4 py-3 font-semibold text-slate-700">
            Cerrar
          </button>
        </div>
      </div>

      {showExtendModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5">
            <h4 className="text-lg font-bold text-slate-900">Agregar tiempo</h4>
            <p className="mt-1 text-xs text-slate-500">Tarifa por minuto sugerida: {formatCurrency(perMinuteRateCents)}</p>
            <div className="mt-3 grid gap-3">
              <label className="grid gap-1">
                <span className="text-sm text-slate-700">Minutos adicionales</span>
                <input
                  type="number"
                  min={1}
                  value={extraMinutes}
                  onChange={(event) => {
                    const next = Math.max(1, Number(event.target.value || 1));
                    setExtraMinutes(next);
                    setExtraAmountCents(Math.max(0, Math.round(next * perMinuteRateCents)));
                  }}
                  className="rounded-xl border border-slate-300 px-4 py-3 text-xl"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm text-slate-700">Cargo adicional (MXN)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={(extraAmountCents / 100).toFixed(2)}
                  onChange={(event) => {
                    const parsed = Number(event.target.value || 0);
                    setExtraAmountCents(Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100)) : 0);
                  }}
                  className="rounded-xl border border-slate-300 px-4 py-3 text-xl"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm text-slate-700">Metodo de pago</span>
                <select
                  value={extendPaymentMethod}
                  onChange={(event) => setExtendPaymentMethod(event.target.value as PaymentMethod)}
                  className="rounded-xl border border-slate-300 px-4 py-3"
                >
                  <option value="cash">Efectivo</option>
                  <option value="card">Tarjeta</option>
                  <option value="transfer">Transferencia</option>
                </select>
              </label>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button onClick={() => setShowExtendModal(false)} className="rounded-xl bg-slate-200 px-4 py-3 font-semibold text-slate-700">
                Cerrar
              </button>
              <button
                onClick={async () => {
                  setSubmitting(true);
                  try {
                    await onAddTime({
                      transactionId: transaction.id,
                      extraMinutes,
                      extraAmountCents,
                      paymentMethod: extendPaymentMethod
                    });
                    setShowExtendModal(false);
                  } finally {
                    setSubmitting(false);
                  }
                }}
                className="rounded-xl bg-blue-700 px-4 py-3 font-semibold text-white"
                disabled={submitting}
              >
                Confirmar extension
              </button>
            </div>
          </div>
        </div>
      )}

      {showVoidModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5">
            <h4 className="text-lg font-bold text-slate-900">Cancelar transaccion</h4>
            <p className="mt-1 text-xs text-slate-500">Esta accion anula la venta pero conserva historial para auditoria.</p>
            <div className="mt-3 grid gap-3">
              <label className="grid gap-1">
                <span className="text-sm text-slate-700">Motivo (requerido)</span>
                <textarea
                  value={voidReason}
                  onChange={(event) => setVoidReason(event.target.value)}
                  className="min-h-24 rounded-xl border border-slate-300 px-3 py-2"
                  placeholder='Ej: "maquina no arranco"'
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm text-slate-700">PIN admin (solo si la transaccion es vieja)</span>
                <input
                  value={adminPin}
                  onChange={(event) => setAdminPin(event.target.value)}
                  className="rounded-xl border border-slate-300 px-3 py-2"
                  placeholder="PIN admin opcional"
                />
              </label>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button onClick={() => setShowVoidModal(false)} className="rounded-xl bg-slate-200 px-4 py-3 font-semibold text-slate-700">
                Cerrar
              </button>
              <button
                onClick={async () => {
                  if (voidReason.trim().length < 4) {
                    return;
                  }
                  setSubmitting(true);
                  try {
                    await onVoidTransaction({
                      transactionId: transaction.id,
                      reason: voidReason.trim(),
                      adminPin: adminPin.trim() || undefined
                    });
                    setShowVoidModal(false);
                  } finally {
                    setSubmitting(false);
                  }
                }}
                className="rounded-xl bg-red-700 px-4 py-3 font-semibold text-white disabled:opacity-60"
                disabled={submitting || voidReason.trim().length < 4}
              >
                Confirmar cancelacion
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
