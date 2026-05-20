"use client";

import { useState } from "react";

import type { DashboardTransaction } from "@/components/pos/types";
import { formatCurrency, formatDateTime } from "@/lib/format";

type TransactionDetailModalProps = {
  transaction: DashboardTransaction;
  onClose: () => void;
  onVoid: (input: { transactionId: string; reason: string; adminPin?: string }) => Promise<void>;
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

function statusLabel(value: string) {
  if (value === "running" || value === "pending_relay") {
    return "Activa";
  }
  if (value === "completed") {
    return "Completada";
  }
  if (value === "voided") {
    return "Anulada";
  }
  return value;
}

export function TransactionDetailModal({ transaction, onClose, onVoid }: TransactionDetailModalProps) {
  const [voidReason, setVoidReason] = useState("");
  const [adminPin, setAdminPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showVoidPrompt, setShowVoidPrompt] = useState(false);
  const canVoid = transaction.status !== "voided";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5">
        <h3 className="text-xl font-bold text-slate-900">Transaccion #{transaction.ticketNumber}</h3>
        <p className="text-sm text-slate-500">{statusLabel(transaction.status)}</p>

        <div className="mt-3 grid gap-1 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
          <p>Hora: {formatDateTime(transaction.createdAt)}</p>
          <p>Maquina: {transaction.machine.name}</p>
          <p>Cliente: {transaction.customer.firstName} {transaction.customer.lastName}</p>
          <p>Importe: {formatCurrency(transaction.amountCents)}</p>
          <p>Metodo de pago: {paymentLabel(transaction.paymentMethod)}</p>
          <p>Servicio: {transaction.serviceType}</p>
          {transaction.parentTransaction && <p>Extension ligada a ticket #{transaction.parentTransaction.ticketNumber}</p>}
          {transaction.voidReason && <p className="text-red-700">Motivo anulacion: {transaction.voidReason}</p>}
          {transaction.voidedAt && <p className="text-red-700">Anulada: {formatDateTime(transaction.voidedAt)}</p>}
          {transaction.voidedByEmployee && <p className="text-red-700">Anulo: {transaction.voidedByEmployee.name}</p>}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <button onClick={onClose} className="rounded-xl bg-slate-200 px-4 py-3 font-semibold text-slate-700">
            Cerrar
          </button>
          {canVoid && (
            <button onClick={() => setShowVoidPrompt((current) => !current)} className="rounded-xl bg-red-700 px-4 py-3 font-semibold text-white">
              Cancelar
            </button>
          )}
        </div>

        {showVoidPrompt && canVoid && (
          <div className="mt-4 grid gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
            <label className="grid gap-1 text-sm">
              <span>Motivo de cancelacion</span>
              <textarea
                value={voidReason}
                onChange={(event) => setVoidReason(event.target.value)}
                className="min-h-24 rounded-xl border border-red-200 px-3 py-2"
                placeholder="Motivo obligatorio"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span>PIN admin (si aplica)</span>
              <input
                value={adminPin}
                onChange={(event) => setAdminPin(event.target.value)}
                className="rounded-xl border border-red-200 px-3 py-2"
                placeholder="PIN admin opcional"
              />
            </label>
            <button
              onClick={async () => {
                if (voidReason.trim().length < 4) {
                  return;
                }
                setSubmitting(true);
                try {
                  await onVoid({
                    transactionId: transaction.id,
                    reason: voidReason.trim(),
                    adminPin: adminPin.trim() || undefined
                  });
                  onClose();
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
        )}
      </div>
    </div>
  );
}
