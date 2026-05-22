"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { apiFetch } from "@/components/pos/api";
import type {
  CustomerRecord,
  EncargoOrder,
  LoyaltyRule,
  Machine,
  PricingVariables,
  ServiceType,
  WorkOrderPreview
} from "@/components/pos/types";

type ActivateModalProps = {
  machine: Machine;
  encargoOrders: EncargoOrder[];
  preferredEncargoOrderId?: string;
  onCancel: () => void;
  onConfirm: (
    machine: Machine,
    form: {
      customerId: string;
      customerName: string;
      baseAmountCents: number;
      durationMinutes: number;
      serviceType: ServiceType;
      paymentMethod: "cash" | "card" | "transfer";
      weightKg: number;
      encargoOrderId?: string;
      addons: {
        detergentQty: number;
        softenerQty: number;
        bleachQty: number;
      };
    }
  ) => Promise<void>;
};

type CustomersPayload = {
  customers: CustomerRecord[];
  loyalty: LoyaltyRule;
};

const serviceLabels: Record<ServiceType, string> = {
  autoservicio: "Autoservicio",
  encargo: "Encargo",
  xl: "XL"
};

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function ActivateModal({ machine, encargoOrders, preferredEncargoOrderId, onCancel, onConfirm }: ActivateModalProps) {
  const [baseAmountCents, setBaseAmountCents] = useState(machine.defaultPriceCents);
  const [durationMinutes] = useState(machine.defaultDurationMinutes);
  const [serviceType, setServiceType] = useState<ServiceType>("autoservicio");
  const [selectedEncargoOrderId, setSelectedEncargoOrderId] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "transfer">("cash");
  const [submitting, setSubmitting] = useState(false);
  const [pricing, setPricing] = useState<PricingVariables | null>(null);
  const [orderWeightKgInput, setOrderWeightKgInput] = useState("5");
  const [assignmentPreview, setAssignmentPreview] = useState<WorkOrderPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [customerQuery, setCustomerQuery] = useState("");
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRecord | null>(null);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [encargoCalcError, setEncargoCalcError] = useState<string | null>(null);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [newCustomerFirstName, setNewCustomerFirstName] = useState("");
  const [newCustomerLastName, setNewCustomerLastName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  const [loyaltyRule, setLoyaltyRule] = useState<LoyaltyRule>({
    everyNTransactions: 10,
    discountPct: 50
  });

  const [encargoWeightKgInput, setEncargoWeightKgInput] = useState("0");
  const [encargoPriceManuallyApplied, setEncargoPriceManuallyApplied] = useState(false);
  const [xlItems, setXlItems] = useState({
    individual: 0,
    matrimonial: 0,
    king: 0,
    cobija: 0,
    almohadaPar: 0
  });
  const [addons, setAddons] = useState({
    detergentQty: 0,
    softenerQty: 0,
    bleachQty: 0
  });

  const activeEncargoOrders = useMemo(() => encargoOrders.filter((order) => order.status !== "picked_up"), [encargoOrders]);
  const preferredOrderHydratedRef = useRef<string | null>(null);
  const customerScopedEncargoOrders = useMemo(() => {
    if (!selectedCustomer) {
      return activeEncargoOrders;
    }
    const scoped = activeEncargoOrders.filter((order) => order.customerId === selectedCustomer.id);
    return scoped.length > 0 ? scoped : activeEncargoOrders;
  }, [activeEncargoOrders, selectedCustomer]);

  const hydrateCustomerFromOrder = useCallback(
    (order: EncargoOrder) => {
      if (!order.customer) {
        return;
      }
      const orderCustomer = order.customer;

      const existing = customers.find((customer) => customer.id === orderCustomer.id);
      if (existing) {
        setSelectedCustomer(existing);
        return;
      }

      setSelectedCustomer({
        id: orderCustomer.id,
        firstName: orderCustomer.firstName,
        lastName: orderCustomer.lastName,
        phone: orderCustomer.phone,
        email: null,
        createdAt: "",
        updatedAt: "",
        eligibleTransactionCount: 0,
        totalSpentCents: 0,
        nextDiscountTransactionNumber: 1,
        isNextTransactionDiscount: false
      });
    },
    [customers]
  );

  useEffect(() => {
    if (serviceType !== "encargo") {
      setSelectedEncargoOrderId("");
      setEncargoPriceManuallyApplied(false);
    }
  }, [serviceType]);

  useEffect(() => {
    if (serviceType !== "encargo" || !selectedCustomer || selectedEncargoOrderId || encargoPriceManuallyApplied) {
      return;
    }

    const match = activeEncargoOrders.find((order) => order.customerId === selectedCustomer.id);
    if (!match) {
      return;
    }

    setSelectedEncargoOrderId(match.id);
    setBaseAmountCents(match.priceCents);
  }, [activeEncargoOrders, encargoPriceManuallyApplied, selectedCustomer, selectedEncargoOrderId, serviceType]);

  useEffect(() => {
    if (!preferredEncargoOrderId) {
      return;
    }
    if (preferredOrderHydratedRef.current === preferredEncargoOrderId) {
      return;
    }
    const selected = activeEncargoOrders.find((order) => order.id === preferredEncargoOrderId);
    if (!selected) {
      return;
    }
    preferredOrderHydratedRef.current = preferredEncargoOrderId;
    setServiceType("encargo");
    setSelectedEncargoOrderId(selected.id);
    setBaseAmountCents(selected.priceCents);
    setOrderWeightKgInput(selected.weightKg.toFixed(1));
    setEncargoPriceManuallyApplied(false);
    hydrateCustomerFromOrder(selected);
    if (selected.customer) {
      setCustomerQuery(`${selected.customer.firstName} ${selected.customer.lastName}`.trim());
    } else if (selected.customerName) {
      setCustomerQuery(selected.customerName);
    }
  }, [activeEncargoOrders, hydrateCustomerFromOrder, preferredEncargoOrderId]);

  useEffect(() => {
    apiFetch<{ pricing: PricingVariables }>("/api/settings/pricing")
      .then((payload) => {
        setPricing(payload.pricing);
        setLoyaltyRule({
          everyNTransactions: payload.pricing.loyaltyEveryNTransactions,
          discountPct: payload.pricing.loyaltyDiscountPct
        });
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setCustomerLoading(true);
      setCustomerError(null);
      apiFetch<CustomersPayload>(`/api/customers?limit=20&query=${encodeURIComponent(customerQuery.trim())}`)
        .then((payload) => {
          setCustomers(payload.customers);
          setLoyaltyRule(payload.loyalty);
        })
        .catch((error) => {
          setCustomerError(error instanceof Error ? error.message : "No fue posible buscar clientes");
        })
        .finally(() => setCustomerLoading(false));
    }, 220);

    return () => window.clearTimeout(id);
  }, [customerQuery]);

  useEffect(() => {
    const parsedWeight = Number(orderWeightKgInput.replace(",", "."));
    if (!Number.isFinite(parsedWeight) || parsedWeight <= 0) {
      setAssignmentPreview(null);
      setPreviewError("Ingresa un peso valido para calcular cargas");
      return;
    }

    const id = window.setTimeout(() => {
      setPreviewLoading(true);
      setPreviewError(null);
      apiFetch<WorkOrderPreview>("/api/orders/process/preview", {
        method: "POST",
        body: JSON.stringify({
          weightKg: parsedWeight,
          serviceType
        })
      })
        .then((payload) => {
          setAssignmentPreview(payload);
        })
        .catch((error) => {
          setAssignmentPreview(null);
          setPreviewError(error instanceof Error ? error.message : "No fue posible calcular disponibilidad");
        })
        .finally(() => setPreviewLoading(false));
    }, 220);

    return () => window.clearTimeout(id);
  }, [orderWeightKgInput, serviceType]);

  const xlTotal = useMemo(() => {
    if (!pricing) {
      return 0;
    }
    return (
      xlItems.individual * pricing.xlEdredonIndividualCents +
      xlItems.matrimonial * pricing.xlEdredonMatrimonialCents +
      xlItems.king * pricing.xlEdredonKingCents +
      xlItems.cobija * pricing.xlCobijaGruesaCents +
      xlItems.almohadaPar * pricing.xlAlmohadaParCents
    );
  }, [pricing, xlItems]);

  const addonTotalCents = useMemo(() => {
    if (!pricing) {
      return 0;
    }

    return (
      addons.detergentQty * pricing.detergentAddonCents +
      addons.softenerQty * pricing.softenerAddonCents +
      addons.bleachQty * pricing.bleachAddonCents
    );
  }, [addons, pricing]);

  const nextTransactionNumber = selectedCustomer ? selectedCustomer.eligibleTransactionCount + 1 : null;
  const loyaltyEvery = Math.max(1, loyaltyRule.everyNTransactions);
  const loyaltyDiscountPct = Math.max(0, Math.min(100, loyaltyRule.discountPct));
  const loyaltyApplies = nextTransactionNumber !== null && nextTransactionNumber % loyaltyEvery === 0;
  const loyaltyDiscountPreviewCents = loyaltyApplies ? Math.round((baseAmountCents * loyaltyDiscountPct) / 100) : 0;
  const finalTotalPreviewCents = Math.max(0, baseAmountCents - loyaltyDiscountPreviewCents + addonTotalCents);

  const registerCustomer = async () => {
    setCreatingCustomer(true);
    setCustomerError(null);
    try {
      const payload = await apiFetch<{ customer: CustomerRecord | null; loyalty: LoyaltyRule }>("/api/customers", {
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

      setLoyaltyRule(payload.loyalty);
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

  const incrementAddon = (key: "detergentQty" | "softenerQty" | "bleachQty") => {
    setAddons((current) => ({
      ...current,
      [key]: current[key] + 1
    }));
  };

  const decrementAddon = (key: "detergentQty" | "softenerQty" | "bleachQty") => {
    setAddons((current) => ({
      ...current,
      [key]: Math.max(0, current[key] - 1)
    }));
  };

  const resetAddons = () => {
    setAddons({
      detergentQty: 0,
      softenerQty: 0,
      bleachQty: 0
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3">
      <div className="max-h-[96vh] w-full max-w-6xl overflow-y-auto rounded-2xl bg-white p-4 sm:p-5">
        <h3 className="text-2xl font-bold text-slate-900">{machine.name}</h3>
        <p className="text-sm text-slate-500">Activacion con ticket y cliente</p>

        <div className="mt-3 grid gap-3 lg:grid-cols-[1.15fr_1fr]">
          <div className="grid gap-3">
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
                    <p className="font-semibold">{customer.firstName} {customer.lastName}</p>
                    <p className="text-xs text-slate-500">{customer.phone} - Tx validas: {customer.eligibleTransactionCount}</p>
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

            {customerError && <p className="rounded-lg bg-red-100 px-3 py-2 text-xs text-red-700">{customerError}</p>}
          </div>

          <div className="grid gap-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Tipo de servicio</p>
              <div className="grid grid-cols-3 gap-2">
                {(["autoservicio", "encargo", "xl"] as ServiceType[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setServiceType(option)}
                    className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                      serviceType === option ? "bg-teal-700 text-white" : "bg-white text-slate-700"
                    }`}
                  >
                    {serviceLabels[option]}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Asignacion por peso</p>
              <label className="grid gap-1 text-xs">
                <span className="font-medium text-slate-700">Peso total (kg)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={orderWeightKgInput}
                  onChange={(event) => setOrderWeightKgInput(event.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2"
                  placeholder="Ej. 17"
                />
              </label>
              {previewLoading && <p className="mt-2 text-xs text-slate-500">Calculando asignacion...</p>}
              {previewError && <p className="mt-2 text-xs text-red-700">{previewError}</p>}
              {assignmentPreview?.shortage && (
                <p className="mt-2 rounded-lg bg-amber-100 px-2 py-1 text-xs text-amber-900">
                  Faltan lavadoras ({assignmentPreview.shortage.availableLoadsNow}/{assignmentPreview.shortage.requiredLoads}).
                  {assignmentPreview.shortage.etaWhenEnoughWashers
                    ? ` Disponibles aprox: ${new Date(assignmentPreview.shortage.etaWhenEnoughWashers).toLocaleString("es-MX")}`
                    : " Sin ETA disponible."}
                </p>
              )}
              {!!assignmentPreview && !assignmentPreview.shortage && (
                <div className="mt-2 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-900">
                  <p className="font-semibold">
                    Cargas: {assignmentPreview.requiredLoads} · Capacidad total: {assignmentPreview.totalCapacityKg.toFixed(1)} kg
                  </p>
                  <div className="mt-1 max-h-20 overflow-y-auto pr-1">
                    {assignmentPreview.assignments.map((load) => (
                      <p key={load.loadIndex}>
                        L{load.loadIndex}: {load.washer.machineName}
                        {load.dryer ? ` -> ${load.dryer.machineName}` : ""}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {pricing && serviceType === "encargo" && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Calculadora encargo</p>
                <label className="mb-2 grid gap-1 text-xs">
                  <span className="font-medium text-slate-700">Orden encargo activa (opcional)</span>
                  <select
                    value={selectedEncargoOrderId}
                    onChange={(event) => {
                      const nextId = event.target.value;
                      setSelectedEncargoOrderId(nextId);
                      setEncargoPriceManuallyApplied(false);
                      setEncargoCalcError(null);
                      const selected = activeEncargoOrders.find((order) => order.id === nextId);
                      if (selected) {
                        hydrateCustomerFromOrder(selected);
                        setBaseAmountCents(selected.priceCents);
                        setOrderWeightKgInput(selected.weightKg.toFixed(1));
                        if (selected.customer) {
                          setCustomerQuery(`${selected.customer.firstName} ${selected.customer.lastName}`.trim());
                        } else if (selected.customerName) {
                          setCustomerQuery(selected.customerName);
                        }
                      }
                    }}
                    className="rounded-lg border border-slate-300 px-3 py-2"
                  >
                    <option value="">Sin orden ligada</option>
                    {customerScopedEncargoOrders.map((order) => (
                      <option key={order.id} value={order.id}>
                        {(order.customerName || order.customerPhone || "Cliente")} - {order.status} - ${(order.priceCents / 100).toFixed(2)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={encargoWeightKgInput}
                    onChange={(event) => setEncargoWeightKgInput(event.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-2"
                    placeholder="Peso (kg)"
                  />
                  <button
                    onClick={() => {
                      const parsedWeightKg = Number(encargoWeightKgInput.replace(",", "."));
                      if (!Number.isFinite(parsedWeightKg) || parsedWeightKg <= 0) {
                        setEncargoCalcError("Ingresa un peso valido para calcular");
                        return;
                      }
                      const calculated = Math.max(
                        Math.round(parsedWeightKg * pricing.encargoPricePerKgCents),
                        pricing.encargoMinimumChargeCents
                      );
                      setEncargoCalcError(null);
                      setEncargoPriceManuallyApplied(true);
                      setBaseAmountCents(calculated);
                    }}
                    className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white"
                  >
                    Aplicar precio
                  </button>
                </div>
                {encargoCalcError && <p className="mt-2 text-xs text-red-700">{encargoCalcError}</p>}
              </div>
            )}

            {pricing && serviceType === "xl" && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Items XL</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button onClick={() => setXlItems((c) => ({ ...c, individual: c.individual + 1 }))} className="rounded-lg bg-slate-700 px-3 py-2 text-xs font-semibold text-white">Edredon individual +1</button>
                  <button onClick={() => setXlItems((c) => ({ ...c, matrimonial: c.matrimonial + 1 }))} className="rounded-lg bg-slate-700 px-3 py-2 text-xs font-semibold text-white">Edredon matrimonial +1</button>
                  <button onClick={() => setXlItems((c) => ({ ...c, king: c.king + 1 }))} className="rounded-lg bg-slate-700 px-3 py-2 text-xs font-semibold text-white">Edredon king +1</button>
                  <button onClick={() => setXlItems((c) => ({ ...c, cobija: c.cobija + 1 }))} className="rounded-lg bg-slate-700 px-3 py-2 text-xs font-semibold text-white">Cobija gruesa +1</button>
                  <button onClick={() => setXlItems((c) => ({ ...c, almohadaPar: c.almohadaPar + 1 }))} className="rounded-lg bg-slate-700 px-3 py-2 text-xs font-semibold text-white">Almohada par +1</button>
                  <button onClick={() => setXlItems({ individual: 0, matrimonial: 0, king: 0, cobija: 0, almohadaPar: 0 })} className="rounded-lg bg-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">Limpiar</button>
                </div>
                <button
                  onClick={() => {
                    if (xlTotal > 0) {
                      setBaseAmountCents(xlTotal);
                    }
                  }}
                  className="mt-2 w-full rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white"
                >
                  Usar total XL ({money(xlTotal)})
                </button>
              </div>
            )}

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Add-ons</p>
                <button
                  type="button"
                  onClick={resetAddons}
                  className="rounded-md bg-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700"
                >
                  Limpiar add-ons
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-white p-2">
                  <button onClick={() => incrementAddon("detergentQty")} type="button" className="w-full rounded-md bg-sky-700 px-2 py-2 text-sm font-semibold text-white">Detergente +{money(pricing?.detergentAddonCents ?? 0)}</button>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <button type="button" onClick={() => decrementAddon("detergentQty")} className="rounded bg-slate-200 px-2 py-1 text-xs">-</button>
                    <span>x{addons.detergentQty}</span>
                    <span className="text-xs text-slate-500">{money(addons.detergentQty * (pricing?.detergentAddonCents ?? 0))}</span>
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-2">
                  <button onClick={() => incrementAddon("softenerQty")} type="button" className="w-full rounded-md bg-violet-700 px-2 py-2 text-sm font-semibold text-white">Suavizante +{money(pricing?.softenerAddonCents ?? 0)}</button>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <button type="button" onClick={() => decrementAddon("softenerQty")} className="rounded bg-slate-200 px-2 py-1 text-xs">-</button>
                    <span>x{addons.softenerQty}</span>
                    <span className="text-xs text-slate-500">{money(addons.softenerQty * (pricing?.softenerAddonCents ?? 0))}</span>
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-2">
                  <button onClick={() => incrementAddon("bleachQty")} type="button" className="w-full rounded-md bg-slate-700 px-2 py-2 text-sm font-semibold text-white">Cloro +{money(pricing?.bleachAddonCents ?? 0)}</button>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <button type="button" onClick={() => decrementAddon("bleachQty")} className="rounded bg-slate-200 px-2 py-1 text-xs">-</button>
                    <span>x{addons.bleachQty}</span>
                    <span className="text-xs text-slate-500">{money(addons.bleachQty * (pricing?.bleachAddonCents ?? 0))}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Configuracion del ticket</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-300 bg-white px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Servicio</p>
                  <p className="text-lg font-semibold text-slate-900">{serviceLabels[serviceType]}</p>
                </div>
                <div className="rounded-lg border border-slate-300 bg-white px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Precio base configurado</p>
                  <p className="text-lg font-semibold text-slate-900">{money(baseAmountCents)}</p>
                </div>
                <div className="rounded-lg border border-slate-300 bg-white px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Duracion configurada</p>
                  <p className="text-lg font-semibold text-slate-900">{durationMinutes} min</p>
                </div>
              </div>
              <label className="mt-2 grid gap-1 text-sm">
                <span className="font-medium text-slate-600">Pago</span>
                <select
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value as "cash" | "card" | "transfer")}
                  className="rounded-lg border border-slate-300 px-3 py-2"
                >
                  <option value="cash">Efectivo</option>
                  <option value="card">Tarjeta</option>
                  <option value="transfer">Transferencia</option>
                </select>
              </label>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 mt-3 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur">
          <div className="mb-2 grid gap-1 text-sm sm:grid-cols-5">
            <p>Servicio: <strong>{serviceLabels[serviceType]}</strong></p>
            <p>Base: <strong>{money(baseAmountCents)}</strong></p>
            <p>Lealtad: <strong>-{money(loyaltyDiscountPreviewCents)}</strong></p>
            <p>Add-ons: <strong>+{money(addonTotalCents)}</strong></p>
            <p className="font-semibold text-slate-900">Total: {money(finalTotalPreviewCents)}</p>
          </div>
          {selectedCustomer && loyaltyApplies && (
            <p className="mb-2 text-xs text-emerald-700">Descuento de lealtad aplicado (Tx #{nextTransactionNumber}, {loyaltyDiscountPct}% off).</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <button onClick={onCancel} className="rounded-xl bg-slate-200 px-4 py-2.5 font-semibold text-slate-700">Cancelar</button>
            <button
              onClick={async () => {
                if (!selectedCustomer) {
                  setCustomerError("Selecciona o registra un cliente antes de activar");
                  return;
                }
                const parsedWeightKg = Number(orderWeightKgInput.replace(",", "."));
                if (!Number.isFinite(parsedWeightKg) || parsedWeightKg <= 0) {
                  setCustomerError("Ingresa un peso valido mayor a 0");
                  return;
                }
                if (!assignmentPreview || !assignmentPreview.canProcess || assignmentPreview.shortage) {
                  setCustomerError("No hay suficiente capacidad de lavadoras para procesar esta orden");
                  return;
                }
                setSubmitting(true);
                try {
                  await onConfirm(machine, {
                    customerId: selectedCustomer.id,
                    customerName: `${selectedCustomer.firstName} ${selectedCustomer.lastName}`.trim(),
                    baseAmountCents,
                    durationMinutes,
                    serviceType,
                    paymentMethod,
                    weightKg: parsedWeightKg,
                    encargoOrderId: serviceType === "encargo" && selectedEncargoOrderId ? selectedEncargoOrderId : undefined,
                    addons
                  });
                } catch (error) {
                  setCustomerError(error instanceof Error ? error.message : "No fue posible activar maquina");
                } finally {
                  setSubmitting(false);
                }
              }}
              className="rounded-xl bg-teal-700 px-4 py-2.5 font-semibold text-white disabled:opacity-60"
              disabled={submitting || !selectedCustomer || !!assignmentPreview?.shortage}
            >
              ACTIVAR
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
