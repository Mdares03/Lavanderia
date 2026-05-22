"use client";

import { useEffect, useMemo, useState } from "react";

import { apiFetch } from "@/components/pos/api";
import type { CustomerRecord, EncargoOrder, LoyaltyRule, PaymentMethod, PricingVariables } from "@/components/pos/types";
import { formatCurrency } from "@/lib/format";

type NewEncargoModalProps = {
  employeeId: string;
  onClose: () => void;
  onCreated: (order: EncargoOrder) => Promise<void>;
};

type CustomersPayload = {
  customers: CustomerRecord[];
  loyalty: LoyaltyRule;
};

export function NewEncargoModal({ employeeId, onClose, onCreated }: NewEncargoModalProps) {
  const [customerQuery, setCustomerQuery] = useState("");
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRecord | null>(null);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [newCustomerFirstName, setNewCustomerFirstName] = useState("");
  const [newCustomerLastName, setNewCustomerLastName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");

  const [weightKgInput, setWeightKgInput] = useState("1");
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

  useEffect(() => {
    const id = window.setTimeout(() => {
      setCustomerLoading(true);
      setCustomerError(null);
      apiFetch<CustomersPayload>(`/api/customers?limit=20&query=${encodeURIComponent(customerQuery.trim())}`)
        .then((payload) => {
          setCustomers(payload.customers);
        })
        .catch((error) => {
          setCustomerError(error instanceof Error ? error.message : "No fue posible buscar clientes");
        })
        .finally(() => setCustomerLoading(false));
    }, 220);

    return () => window.clearTimeout(id);
  }, [customerQuery]);

  const parsedWeightKg = Number(weightKgInput.replace(",", "."));
  const normalizedWeightKg = Number.isFinite(parsedWeightKg) ? parsedWeightKg : 0;
  const estimatedLoads = Math.max(
    1,
    Math.ceil(Math.max(0, normalizedWeightKg) / Math.max(pricing?.washerNormalCapacityKg ?? 5, 0.1))
  );

  const estimatedPriceCents = useMemo(() => {
    if (!pricing) {
      return 0;
    }
    const raw = Math.round(Math.max(0, normalizedWeightKg) * pricing.encargoPricePerKgCents);
    return Math.max(raw, pricing.encargoMinimumChargeCents);
  }, [normalizedWeightKg, pricing]);

  const registerCustomer = async () => {
    setCreatingCustomer(true);
    setCustomerError(null);
    try {
      const payload = await apiFetch<{ customer: CustomerRecord | null }>("/api/customers", {
        method: "POST",
        body: JSON.stringify({
          firstName: newCustomerFirstName,
          lastName: newCustomerLastName,
          phone: newCustomerPhone,
          email: newCustomerEmail.trim().length > 0 ? newCustomerEmail : undefined
        })
      });

      if (!payload.customer) {
        throw new Error("No fue posible recuperar cliente nuevo");
      }

      setSelectedCustomer(payload.customer);
      setCustomerQuery(`${payload.customer.firstName} ${payload.customer.lastName}`.trim());
      setNewCustomerFirstName("");
      setNewCustomerLastName("");
      setNewCustomerPhone("");
      setNewCustomerEmail("");
    } catch (error) {
      setCustomerError(error instanceof Error ? error.message : "No fue posible registrar cliente");
    } finally {
      setCreatingCustomer(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-3xl rounded-2xl bg-white p-5">
        <h3 className="text-xl font-bold text-slate-900">Nuevo Encargo</h3>
        <p className="text-sm text-slate-500">Selecciona cliente de base o registralo al momento</p>

        <div className="mt-3 grid gap-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Cliente obligatorio</p>
            <input
              value={customerQuery}
              onChange={(event) => setCustomerQuery(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="Buscar por nombre, telefono o email"
            />
            {customerLoading && <p className="mt-2 text-xs text-slate-500">Buscando...</p>}
            <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-slate-200 bg-white">
              {customers.length === 0 && <p className="px-3 py-2 text-xs text-slate-500">Sin resultados</p>}
              {customers.map((customer) => (
                <button
                  key={customer.id}
                  onClick={() => setSelectedCustomer(customer)}
                  className={`block w-full border-b border-slate-100 px-3 py-2 text-left text-sm last:border-b-0 ${selectedCustomer?.id === customer.id ? "bg-emerald-100" : "hover:bg-slate-50"}`}
                >
                  <p className="font-semibold">
                    {customer.firstName} {customer.lastName}
                  </p>
                  <p className="text-xs text-slate-500">
                    {customer.phone} - Tx validas: {customer.eligibleTransactionCount}
                  </p>
                </button>
              ))}
            </div>
            {selectedCustomer && (
              <div className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                Cliente seleccionado: {selectedCustomer.firstName} {selectedCustomer.lastName} ({selectedCustomer.phone})
              </div>
            )}
          </div>

          <details className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-600">Registrar cliente nuevo</summary>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <input
                value={newCustomerFirstName}
                onChange={(event) => setNewCustomerFirstName(event.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2"
                placeholder="Nombre"
              />
              <input
                value={newCustomerLastName}
                onChange={(event) => setNewCustomerLastName(event.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2"
                placeholder="Apellido"
              />
              <input
                value={newCustomerPhone}
                onChange={(event) => setNewCustomerPhone(event.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2"
                placeholder="Telefono"
              />
              <input
                value={newCustomerEmail}
                onChange={(event) => setNewCustomerEmail(event.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2"
                placeholder="Email (opcional)"
              />
            </div>
            <button
              onClick={registerCustomer}
              disabled={creatingCustomer}
              className="mt-2 rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
            >
              {creatingCustomer ? "Registrando..." : "Registrar y seleccionar"}
            </button>
          </details>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-sm text-slate-700">Peso (kg)</span>
              <input
                type="text"
                inputMode="decimal"
                value={weightKgInput}
                onChange={(event) => setWeightKgInput(event.target.value)}
                className="rounded-xl border border-slate-300 px-3 py-2"
              />
            </label>
            <div className="grid gap-1">
              <span className="text-sm text-slate-700">No. cargas (auto)</span>
              <div className="rounded-xl border border-slate-300 bg-slate-100 px-3 py-2 text-slate-800">{estimatedLoads}</div>
            </div>
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

          {customerError && <p className="rounded-lg bg-red-100 px-3 py-2 text-xs text-red-700">{customerError}</p>}
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
              if (!selectedCustomer) {
                setCustomerError("Selecciona o registra un cliente antes de crear el encargo");
                return;
              }
              if (!Number.isFinite(normalizedWeightKg) || normalizedWeightKg <= 0) {
                setCustomerError("Ingresa un peso valido mayor a 0");
                return;
              }
              setSubmitting(true);
              try {
                const payload = await apiFetch<{ order: EncargoOrder }>("/api/encargo-orders", {
                  method: "POST",
                  body: JSON.stringify({
                    employeeId,
                    customerId: selectedCustomer.id,
                    weightKg: normalizedWeightKg,
                    loads: estimatedLoads,
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
            disabled={submitting || !selectedCustomer}
          >
            Crear encargo
          </button>
        </div>
      </div>
    </div>
  );
}
