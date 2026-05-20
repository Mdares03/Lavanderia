"use client";

import { useEffect, useMemo, useState } from "react";

import { apiFetch } from "@/components/pos/api";
import type { EncargoOrder, PaymentMethod, PricingVariables } from "@/components/pos/types";
import { formatCurrency } from "@/lib/format";

type NewEncargoModalProps = {
  employeeId: string;
  onClose: () => void;
  onCreated: (order: EncargoOrder) => Promise<void>;
};

export function NewEncargoModal({ employeeId, onClose, onCreated }: NewEncargoModalProps) {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [weightKg, setWeightKg] = useState(1);
  const [loads, setLoads] = useState(1);
  const [notes, setNotes] = useState("");
  const [paymentMode, setPaymentMode] = useState<"now" | "pickup">("now");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [pricing, setPricing] = useState<PricingVariables | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiFetch<{ pricing: PricingVariables }>("/api/settings/pricing")
      .then((payload) => setPricing(payload.pricing))
      .catch(() => undefined);
  }, []);

  const estimatedPriceCents = useMemo(() => {
    if (!pricing) {
      return 0;
    }
    const raw = Math.round(Math.max(0, weightKg) * pricing.encargoPricePerKgCents);
    return Math.max(raw, pricing.encargoMinimumChargeCents);
  }, [pricing, weightKg]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-xl rounded-2xl bg-white p-5">
        <h3 className="text-xl font-bold text-slate-900">Nuevo Encargo</h3>
        <p className="text-sm text-slate-500">Registro rapido de orden de mostrador</p>

        <div className="mt-3 grid gap-3">
          <label className="grid gap-1">
            <span className="text-sm text-slate-700">Nombre cliente (opcional)</span>
            <input
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2"
              placeholder="Nombre"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm text-slate-700">Telefono (opcional)</span>
            <input
              value={customerPhone}
              onChange={(event) => setCustomerPhone(event.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2"
              placeholder="Telefono"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-sm text-slate-700">Peso (kg)</span>
              <input
                type="number"
                min={0.1}
                step="0.1"
                value={weightKg}
                onChange={(event) => setWeightKg(Math.max(0.1, Number(event.target.value || 0.1)))}
                className="rounded-xl border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-sm text-slate-700">No. cargas</span>
              <input
                type="number"
                min={1}
                value={loads}
                onChange={(event) => setLoads(Math.max(1, Number(event.target.value || 1)))}
                className="rounded-xl border border-slate-300 px-3 py-2"
              />
            </label>
          </div>
          <label className="grid gap-1">
            <span className="text-sm text-slate-700">Notas</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="min-h-20 rounded-xl border border-slate-300 px-3 py-2"
              placeholder="Ej. separar blancos"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-sm text-slate-700">Cobro</span>
              <select
                value={paymentMode}
                onChange={(event) => setPaymentMode(event.target.value as "now" | "pickup")}
                className="rounded-xl border border-slate-300 px-3 py-2"
              >
                <option value="now">Cobrar ahora</option>
                <option value="pickup">Pagar al recoger</option>
              </select>
            </label>
            {paymentMode === "now" && (
              <label className="grid gap-1">
                <span className="text-sm text-slate-700">Metodo de pago</span>
                <select
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}
                  className="rounded-xl border border-slate-300 px-3 py-2"
                >
                  <option value="cash">Efectivo</option>
                  <option value="card">Tarjeta</option>
                  <option value="transfer">Transferencia</option>
                </select>
              </label>
            )}
          </div>
        </div>

        <div className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Precio calculado: <strong>{formatCurrency(estimatedPriceCents)}</strong>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <button onClick={onClose} className="rounded-xl bg-slate-200 px-4 py-3 font-semibold text-slate-700">
            Cancelar
          </button>
          <button
            onClick={async () => {
              setSubmitting(true);
              try {
                const payload = await apiFetch<{ order: EncargoOrder }>("/api/encargo-orders", {
                  method: "POST",
                  body: JSON.stringify({
                    employeeId,
                    customerName: customerName.trim() || undefined,
                    customerPhone: customerPhone.trim() || undefined,
                    weightKg,
                    loads,
                    notes: notes.trim() || undefined,
                    paymentMode,
                    paymentMethod: paymentMode === "now" ? paymentMethod : undefined
                  })
                });
                await onCreated(payload.order);
              } finally {
                setSubmitting(false);
              }
            }}
            className="rounded-xl bg-teal-700 px-4 py-3 font-semibold text-white disabled:opacity-60"
            disabled={submitting}
          >
            Crear encargo
          </button>
        </div>
      </div>
    </div>
  );
}
