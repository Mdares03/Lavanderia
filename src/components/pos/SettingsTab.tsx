"use client";

import { useEffect, useState } from "react";

import { apiFetch } from "@/components/pos/api";
import type { CustomerRecord, Employee, Machine, PricingVariables } from "@/components/pos/types";
import { formatCurrency } from "@/lib/format";

type SettingsTabProps = {
  employee: Employee;
  adminPin: string;
  machines: Machine[];
  employees: Employee[];
  onRefresh: () => Promise<void>;
  onError: (value: string) => void;
};

export function SettingsTab({ employee, adminPin, machines, employees, onRefresh, onError }: SettingsTabProps) {
  const [newEmployeeName, setNewEmployeeName] = useState("");
  const [newEmployeePin, setNewEmployeePin] = useState("");
  const [newEmployeeIsAdmin, setNewEmployeeIsAdmin] = useState(false);
  const [serialPath, setSerialPath] = useState("COM3");
  const [serialBaudRate, setSerialBaudRate] = useState(9600);
  const [mockMode, setMockMode] = useState(true);
  const [bulkPrice, setBulkPrice] = useState("");
  const [bulkDuration, setBulkDuration] = useState("");
  const [machineDrafts, setMachineDrafts] = useState<Record<string, { price: number; duration: number }>>({});
  const [pricing, setPricing] = useState<PricingVariables | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [showMachineList, setShowMachineList] = useState(false);
  const [testingMachineId, setTestingMachineId] = useState<string | null>(null);
  const [testingAllRelays, setTestingAllRelays] = useState(false);
  const [relayTestFeedback, setRelayTestFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (machines.length === 0) {
      return;
    }
    if (!bulkPrice) {
      setBulkPrice((machines[0].defaultPriceCents / 100).toString());
    }
    if (!bulkDuration) {
      setBulkDuration(machines[0].defaultDurationMinutes.toString());
    }
  }, [bulkDuration, bulkPrice, machines]);

  useEffect(() => {
    apiFetch<{ pricing: PricingVariables }>("/api/settings/pricing", {
      headers: {
        "x-admin-pin": adminPin
      }
    })
      .then((payload) => setPricing(payload.pricing))
      .catch(() => undefined);
  }, [adminPin]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setCustomersLoading(true);
      apiFetch<{ customers: CustomerRecord[] }>(`/api/customers?limit=200&query=${encodeURIComponent(customerQuery.trim())}`)
        .then((payload) => setCustomers(payload.customers))
        .catch(() => undefined)
        .finally(() => setCustomersLoading(false));
    }, 250);

    return () => window.clearTimeout(id);
  }, [customerQuery]);

  const getMachineDraft = (machine: Machine) =>
    machineDrafts[machine.id] ?? {
      price: machine.defaultPriceCents / 100,
      duration: machine.defaultDurationMinutes
    };

  const washers = machines.filter((machine) => machine.type === "washer");
  const dryers = machines.filter((machine) => machine.type === "dryer");

  const renderMachineItem = (machine: Machine) => (
    <li key={machine.id} className="rounded-lg bg-slate-100 px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">{machine.name}</span>
        <button
          onClick={async () => {
            try {
              await apiFetch(`/api/machines/${machine.id}`, {
                method: "PATCH",
                headers: {
                  "x-admin-pin": adminPin
                },
                body: JSON.stringify({ outOfService: machine.status !== "out_of_service" })
              });
              await onRefresh();
            } catch (error) {
              onError(error instanceof Error ? error.message : "No fue posible actualizar maquina");
            }
          }}
          className={`rounded-lg px-3 py-1 text-xs font-semibold ${machine.status === "out_of_service" ? "bg-red-700 text-white" : "bg-emerald-700 text-white"}`}
        >
          {machine.status === "out_of_service" ? "Fuera de servicio" : "Activa"}
        </button>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input
          type="number"
          min={1}
          value={getMachineDraft(machine).price}
          onChange={(event) =>
            setMachineDrafts((current) => ({
              ...current,
              [machine.id]: {
                ...(current[machine.id] ?? {
                  price: machine.defaultPriceCents / 100,
                  duration: machine.defaultDurationMinutes
                }),
                price: Number(event.target.value || 0)
              }
            }))
          }
          className="rounded-lg border border-slate-300 px-3 py-2"
          placeholder="Precio"
        />
        <input
          type="number"
          min={1}
          value={getMachineDraft(machine).duration}
          onChange={(event) =>
            setMachineDrafts((current) => ({
              ...current,
              [machine.id]: {
                ...(current[machine.id] ?? {
                  price: machine.defaultPriceCents / 100,
                  duration: machine.defaultDurationMinutes
                }),
                duration: Number(event.target.value || 0)
              }
            }))
          }
          className="rounded-lg border border-slate-300 px-3 py-2"
          placeholder="Minutos"
        />
        <button
          onClick={async () => {
            const draft = getMachineDraft(machine);
            try {
              await apiFetch(`/api/machines/${machine.id}`, {
                method: "PATCH",
                headers: {
                  "x-admin-pin": adminPin
                },
                body: JSON.stringify({
                  defaultPriceCents: Math.round(draft.price * 100),
                  defaultDurationMinutes: Math.round(draft.duration)
                })
              });
              await onRefresh();
            } catch (error) {
              onError(error instanceof Error ? error.message : "No fue posible guardar configuracion");
            }
          }}
          className="rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white"
        >
          Guardar
        </button>
      </div>
      <div className="mt-2">
        <button
          onClick={async () => {
            setTestingMachineId(machine.id);
            try {
              await apiFetch(`/api/machines/${machine.id}/test-relay`, {
                method: "POST",
                headers: {
                  "x-admin-pin": adminPin
                }
              });
              setRelayTestFeedback(`Relay OK en ${machine.name}`);
            } catch (error) {
              onError(error instanceof Error ? error.message : "No fue posible probar relay");
            } finally {
              setTestingMachineId(null);
            }
          }}
          className="rounded-lg bg-indigo-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
          disabled={testingMachineId === machine.id || testingAllRelays}
        >
          {testingMachineId === machine.id ? "Probando relay..." : "Probar relay"}
        </button>
      </div>
    </li>
  );

  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <article className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900">Maquinas</h2>
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm font-semibold text-slate-800">Aplicar valor global a todas</p>
          <p className="mt-1 text-xs text-slate-600">Despues puedes sobrescribir una maquina individualmente.</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input
              type="number"
              min={1}
              value={bulkPrice}
              onChange={(event) => setBulkPrice(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2"
              placeholder="Precio global"
            />
            <input
              type="number"
              min={1}
              value={bulkDuration}
              onChange={(event) => setBulkDuration(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2"
              placeholder="Minutos globales"
            />
            <button
              onClick={async () => {
                const payload: { defaultPriceCents?: number; defaultDurationMinutes?: number } = {};

                if (bulkPrice.trim().length > 0) {
                  const parsedPrice = Number(bulkPrice);
                  if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
                    onError("Precio global invalido");
                    return;
                  }
                  payload.defaultPriceCents = Math.round(parsedPrice * 100);
                }
                if (bulkDuration.trim().length > 0) {
                  const parsedDuration = Number(bulkDuration);
                  if (!Number.isFinite(parsedDuration) || parsedDuration <= 0) {
                    onError("Duracion global invalida");
                    return;
                  }
                  payload.defaultDurationMinutes = Math.round(parsedDuration);
                }
                if (!payload.defaultPriceCents && !payload.defaultDurationMinutes) {
                  onError("Ingresa precio o duracion global");
                  return;
                }

                try {
                  await apiFetch("/api/machines/bulk", {
                    method: "PATCH",
                    headers: {
                      "x-admin-pin": adminPin
                    },
                    body: JSON.stringify(payload)
                  });
                  setMachineDrafts({});
                  await onRefresh();
                } catch (error) {
                  onError(error instanceof Error ? error.message : "No fue posible aplicar configuracion global");
                }
              }}
              className="rounded-lg bg-indigo-700 px-3 py-2 text-xs font-semibold text-white"
            >
              Aplicar a todas
            </button>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-xs text-slate-600">Lista individual de maquinas</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={async () => {
                setTestingAllRelays(true);
                setRelayTestFeedback(null);
                try {
                  const payload = await apiFetch<{
                    count: number;
                    results: Array<{ machineId: string; machineName: string; success: boolean; error?: string }>;
                  }>("/api/machines/test-all-relays", {
                    method: "POST",
                    headers: {
                      "x-admin-pin": adminPin
                    }
                  });
                  const fails = payload.results.filter((row) => !row.success);
                  if (fails.length > 0) {
                    onError(`Prueba completa con fallas: ${fails.map((item) => item.machineName).join(", ")}`);
                  } else {
                    setRelayTestFeedback(`Prueba completa OK: ${payload.count} maquinas`);
                  }
                } catch (error) {
                  onError(error instanceof Error ? error.message : "No fue posible probar todos los relays");
                } finally {
                  setTestingAllRelays(false);
                }
              }}
              className="rounded-lg bg-indigo-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
              disabled={testingAllRelays || testingMachineId !== null}
            >
              {testingAllRelays ? "Probando..." : "Probar TODAS"}
            </button>
            <button
              onClick={() => setShowMachineList((current) => !current)}
              className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white"
            >
              {showMachineList ? "Ocultar lista" : `Mostrar lista (${machines.length})`}
            </button>
          </div>
        </div>
        {relayTestFeedback && <p className="mt-2 text-xs font-semibold text-emerald-700">{relayTestFeedback}</p>}
        {showMachineList && (
          <div className="mt-3 grid gap-3 text-sm">
            <details className="rounded-xl border border-slate-200 bg-white p-3" open>
              <summary className="cursor-pointer font-semibold text-slate-800">Lavadoras ({washers.length})</summary>
              <ul className="mt-3 grid gap-2">{washers.map(renderMachineItem)}</ul>
            </details>
            <details className="rounded-xl border border-slate-200 bg-white p-3">
              <summary className="cursor-pointer font-semibold text-slate-800">Secadoras ({dryers.length})</summary>
              <ul className="mt-3 grid gap-2">{dryers.map(renderMachineItem)}</ul>
            </details>
          </div>
        )}
      </article>

      <article className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900">Empleados</h2>
        <ul className="mt-3 grid gap-2 text-sm">
          {employees.map((item) => (
            <li key={item.id} className="rounded-lg bg-slate-100 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {item.name} {item.isAdmin ? "(admin)" : "(empleado)"}
                </span>
                {employee.isAdmin && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={async () => {
                        const rawPin = window.prompt(`Nuevo PIN para ${item.name} (4 digitos)`, "");
                        if (rawPin === null) {
                          return;
                        }
                        const nextPin = rawPin.trim();
                        if (!/^\d{4}$/.test(nextPin)) {
                          onError("El PIN debe tener exactamente 4 digitos");
                          return;
                        }
                        try {
                          await apiFetch(`/api/settings/employees/${item.id}`, {
                            method: "PATCH",
                            headers: {
                              "x-admin-pin": adminPin
                            },
                            body: JSON.stringify({
                              pin: nextPin
                            })
                          });
                          await onRefresh();
                        } catch (error) {
                          onError(error instanceof Error ? error.message : "No fue posible actualizar PIN");
                        }
                      }}
                      className="rounded-lg bg-slate-700 px-3 py-1 text-xs font-semibold text-white"
                    >
                      Cambiar PIN
                    </button>
                    {item.id !== employee.id && (
                      <button
                        onClick={async () => {
                          try {
                            await apiFetch(`/api/settings/employees/${item.id}`, {
                              method: "PATCH",
                              headers: {
                                "x-admin-pin": adminPin
                              },
                              body: JSON.stringify({
                                isAdmin: !item.isAdmin
                              })
                            });
                            await onRefresh();
                          } catch (error) {
                            onError(error instanceof Error ? error.message : "No fue posible actualizar rol");
                          }
                        }}
                        className={`rounded-lg px-3 py-1 text-xs font-semibold text-white ${item.isAdmin ? "bg-amber-700" : "bg-indigo-700"}`}
                      >
                        {item.isAdmin ? "Quitar admin" : "Hacer admin"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
        {employee.isAdmin && (
          <div className="mt-4 grid gap-2">
            <input
              value={newEmployeeName}
              onChange={(event) => setNewEmployeeName(event.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2"
              placeholder="Nombre"
            />
            <input
              value={newEmployeePin}
              onChange={(event) => setNewEmployeePin(event.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2"
              placeholder="PIN 4 digitos"
            />
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={newEmployeeIsAdmin}
                onChange={(event) => setNewEmployeeIsAdmin(event.target.checked)}
              />
              Crear como administrador
            </label>
            <button
              onClick={async () => {
                try {
                  await apiFetch("/api/settings/employees", {
                    method: "POST",
                    headers: {
                      "x-admin-pin": adminPin
                    },
                    body: JSON.stringify({
                      name: newEmployeeName,
                      pin: newEmployeePin,
                      isAdmin: newEmployeeIsAdmin
                    })
                  });
                  setNewEmployeeName("");
                  setNewEmployeePin("");
                  setNewEmployeeIsAdmin(false);
                  await onRefresh();
                } catch (error) {
                  onError(error instanceof Error ? error.message : "No fue posible crear empleado");
                }
              }}
              className="rounded-xl bg-teal-700 px-4 py-2 font-semibold text-white"
            >
              Agregar persona
            </button>
          </div>
        )}
      </article>

      <article className="rounded-2xl bg-white p-5 shadow-sm lg:col-span-2">
        <h2 className="text-xl font-bold text-slate-900">Serial / Relay</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={mockMode} onChange={(event) => setMockMode(event.target.checked)} />
            Modo simulador
          </label>
          <input
            value={serialPath}
            onChange={(event) => setSerialPath(event.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2"
            placeholder="Puerto"
          />
          <input
            type="number"
            value={serialBaudRate}
            onChange={(event) => setSerialBaudRate(Number(event.target.value || 9600))}
            className="rounded-xl border border-slate-300 px-3 py-2"
            placeholder="BaudRate"
          />
          <button
            onClick={async () => {
              try {
                await apiFetch("/api/settings/serial", {
                  method: "PATCH",
                  headers: {
                    "x-admin-pin": adminPin
                  },
                  body: JSON.stringify({
                    relayMockMode: mockMode,
                    serialPortPath: serialPath,
                    serialBaudRate
                  })
                });
                await onRefresh();
              } catch (error) {
                onError(error instanceof Error ? error.message : "No fue posible actualizar serial");
              }
            }}
            className="rounded-xl bg-slate-800 px-4 py-2 font-semibold text-white"
          >
            Reconectar relay
          </button>
        </div>
      </article>

      {pricing && (
        <article className="rounded-2xl bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="text-xl font-bold text-slate-900">Variables de precio</h2>
          <p className="mt-1 text-xs text-slate-600">Configuracion por categoria de servicio</p>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <h3 className="text-sm font-semibold text-slate-800">Servicio 1: Autoservicio</h3>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <label className="grid gap-1 text-xs">
                  <span className="font-medium text-slate-700">Precio lavado (MXN)</span>
                  <input
                    type="number"
                    min={1}
                    value={pricing.selfServiceWashPriceCents / 100}
                    onChange={(event) =>
                      setPricing((current) => (current ? { ...current, selfServiceWashPriceCents: Math.round(Number(event.target.value || 0) * 100) } : current))
                    }
                    className="rounded-xl border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="grid gap-1 text-xs">
                  <span className="font-medium text-slate-700">Precio secado (MXN)</span>
                  <input
                    type="number"
                    min={1}
                    value={pricing.selfServiceDryPriceCents / 100}
                    onChange={(event) =>
                      setPricing((current) => (current ? { ...current, selfServiceDryPriceCents: Math.round(Number(event.target.value || 0) * 100) } : current))
                    }
                    className="rounded-xl border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="grid gap-1 text-xs">
                  <span className="font-medium text-slate-700">Minutos por ciclo</span>
                  <input
                    type="number"
                    min={1}
                    value={pricing.selfServiceCycleMinutes}
                    onChange={(event) =>
                      setPricing((current) => (current ? { ...current, selfServiceCycleMinutes: Math.round(Number(event.target.value || 0)) } : current))
                    }
                    className="rounded-xl border border-slate-300 px-3 py-2"
                  />
                </label>
              </div>
            </article>

            <article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <h3 className="text-sm font-semibold text-slate-800">Servicio 2: Encargo</h3>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <label className="grid gap-1 text-xs">
                  <span className="font-medium text-slate-700">Precio por kg (MXN)</span>
                  <input
                    type="number"
                    min={1}
                    value={pricing.encargoPricePerKgCents / 100}
                    onChange={(event) =>
                      setPricing((current) => (current ? { ...current, encargoPricePerKgCents: Math.round(Number(event.target.value || 0) * 100) } : current))
                    }
                    className="rounded-xl border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="grid gap-1 text-xs">
                  <span className="font-medium text-slate-700">Cobro minimo (MXN)</span>
                  <input
                    type="number"
                    min={1}
                    value={pricing.encargoMinimumChargeCents / 100}
                    onChange={(event) =>
                      setPricing((current) => (current ? { ...current, encargoMinimumChargeCents: Math.round(Number(event.target.value || 0) * 100) } : current))
                    }
                    className="rounded-xl border border-slate-300 px-3 py-2"
                  />
                </label>
              </div>
            </article>

            <article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <h3 className="text-sm font-semibold text-slate-800">Servicio 3: XL</h3>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <label className="grid gap-1 text-xs">
                  <span className="font-medium text-slate-700">Edredon individual (MXN)</span>
                  <input
                    type="number"
                    min={1}
                    value={pricing.xlEdredonIndividualCents / 100}
                    onChange={(event) =>
                      setPricing((current) => (current ? { ...current, xlEdredonIndividualCents: Math.round(Number(event.target.value || 0) * 100) } : current))
                    }
                    className="rounded-xl border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="grid gap-1 text-xs">
                  <span className="font-medium text-slate-700">Edredon matrimonial (MXN)</span>
                  <input
                    type="number"
                    min={1}
                    value={pricing.xlEdredonMatrimonialCents / 100}
                    onChange={(event) =>
                      setPricing((current) => (current ? { ...current, xlEdredonMatrimonialCents: Math.round(Number(event.target.value || 0) * 100) } : current))
                    }
                    className="rounded-xl border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="grid gap-1 text-xs">
                  <span className="font-medium text-slate-700">Edredon king (MXN)</span>
                  <input
                    type="number"
                    min={1}
                    value={pricing.xlEdredonKingCents / 100}
                    onChange={(event) =>
                      setPricing((current) => (current ? { ...current, xlEdredonKingCents: Math.round(Number(event.target.value || 0) * 100) } : current))
                    }
                    className="rounded-xl border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="grid gap-1 text-xs">
                  <span className="font-medium text-slate-700">Cobija gruesa (MXN)</span>
                  <input
                    type="number"
                    min={1}
                    value={pricing.xlCobijaGruesaCents / 100}
                    onChange={(event) =>
                      setPricing((current) => (current ? { ...current, xlCobijaGruesaCents: Math.round(Number(event.target.value || 0) * 100) } : current))
                    }
                    className="rounded-xl border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="grid gap-1 text-xs">
                  <span className="font-medium text-slate-700">Par de almohadas (MXN)</span>
                  <input
                    type="number"
                    min={1}
                    value={pricing.xlAlmohadaParCents / 100}
                    onChange={(event) =>
                      setPricing((current) => (current ? { ...current, xlAlmohadaParCents: Math.round(Number(event.target.value || 0) * 100) } : current))
                    }
                    className="rounded-xl border border-slate-300 px-3 py-2"
                  />
                </label>
              </div>
            </article>

            <article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <h3 className="text-sm font-semibold text-slate-800">Tintoreria</h3>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <label className="grid gap-1 text-xs">
                  <span className="font-medium text-slate-700">Minimo tintoreria (MXN)</span>
                  <input
                    type="number"
                    min={1}
                    value={pricing.dryCleaningMinimumCents / 100}
                    onChange={(event) =>
                      setPricing((current) => (current ? { ...current, dryCleaningMinimumCents: Math.round(Number(event.target.value || 0) * 100) } : current))
                    }
                    className="rounded-xl border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="grid gap-1 text-xs">
                  <span className="font-medium text-slate-700">Recargo urgente (%)</span>
                  <input
                    type="number"
                    min={0}
                    max={300}
                    value={pricing.dryCleaningUrgentSurchargePct}
                    onChange={(event) =>
                      setPricing((current) => (current ? { ...current, dryCleaningUrgentSurchargePct: Math.round(Number(event.target.value || 0)) } : current))
                    }
                    className="rounded-xl border border-slate-300 px-3 py-2"
                  />
                </label>
              </div>
            </article>

            <article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <h3 className="text-sm font-semibold text-slate-800">Add-ons</h3>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <label className="grid gap-1 text-xs">
                  <span className="font-medium text-slate-700">Detergente (MXN)</span>
                  <input
                    type="number"
                    min={0}
                    value={pricing.detergentAddonCents / 100}
                    onChange={(event) =>
                      setPricing((current) => (current ? { ...current, detergentAddonCents: Math.round(Number(event.target.value || 0) * 100) } : current))
                    }
                    className="rounded-xl border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="grid gap-1 text-xs">
                  <span className="font-medium text-slate-700">Suavizante (MXN)</span>
                  <input
                    type="number"
                    min={0}
                    value={pricing.softenerAddonCents / 100}
                    onChange={(event) =>
                      setPricing((current) => (current ? { ...current, softenerAddonCents: Math.round(Number(event.target.value || 0) * 100) } : current))
                    }
                    className="rounded-xl border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="grid gap-1 text-xs">
                  <span className="font-medium text-slate-700">Cloro (MXN)</span>
                  <input
                    type="number"
                    min={0}
                    value={pricing.bleachAddonCents / 100}
                    onChange={(event) =>
                      setPricing((current) => (current ? { ...current, bleachAddonCents: Math.round(Number(event.target.value || 0) * 100) } : current))
                    }
                    className="rounded-xl border border-slate-300 px-3 py-2"
                  />
                </label>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <label className="grid gap-1 text-xs">
                  <span className="font-medium text-slate-700">Cada N transacciones</span>
                  <input
                    type="number"
                    min={1}
                    value={pricing.loyaltyEveryNTransactions}
                    onChange={(event) =>
                      setPricing((current) => (current ? { ...current, loyaltyEveryNTransactions: Math.round(Number(event.target.value || 0)) } : current))
                    }
                    className="rounded-xl border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="grid gap-1 text-xs">
                  <span className="font-medium text-slate-700">Descuento de lealtad (%)</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={pricing.loyaltyDiscountPct}
                    onChange={(event) =>
                      setPricing((current) => (current ? { ...current, loyaltyDiscountPct: Math.round(Number(event.target.value || 0)) } : current))
                    }
                    className="rounded-xl border border-slate-300 px-3 py-2"
                  />
                </label>
              </div>
            </article>
          </div>
          <div className="mt-3">
            <button
              onClick={async () => {
                try {
                  await apiFetch("/api/settings/pricing", {
                    method: "PATCH",
                    headers: {
                      "x-admin-pin": adminPin
                    },
                    body: JSON.stringify(pricing)
                  });
                  await onRefresh();
                } catch (error) {
                  onError(error instanceof Error ? error.message : "No fue posible actualizar variables de precio");
                }
              }}
              className="rounded-xl bg-teal-700 px-4 py-2 font-semibold text-white"
            >
              Guardar variables
            </button>
          </div>
        </article>
      )}

      <article className="rounded-2xl bg-white p-5 shadow-sm lg:col-span-2">
        <h2 className="text-xl font-bold text-slate-900">Base de clientes</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={customerQuery}
            onChange={(event) => setCustomerQuery(event.target.value)}
            className="w-full max-w-md rounded-xl border border-slate-300 px-3 py-2"
            placeholder="Buscar por nombre, telefono o email"
          />
          {customersLoading && <span className="text-xs text-slate-500">Buscando...</span>}
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Telefono</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Tx validas</th>
                <th className="px-3 py-2">Siguiente promo</th>
                <th className="px-3 py-2">Total gastado</th>
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 && (
                <tr>
                  <td className="px-3 py-3 text-slate-500" colSpan={6}>
                    Sin clientes para mostrar
                  </td>
                </tr>
              )}
              {customers.map((customer) => (
                <tr key={customer.id} className="border-b border-slate-100">
                  <td className="px-3 py-2 font-medium">
                    {customer.firstName} {customer.lastName}
                  </td>
                  <td className="px-3 py-2">{customer.phone}</td>
                  <td className="px-3 py-2">{customer.email || "-"}</td>
                  <td className="px-3 py-2">{customer.eligibleTransactionCount}</td>
                  <td className="px-3 py-2">Tx #{customer.nextDiscountTransactionNumber}</td>
                  <td className="px-3 py-2">{formatCurrency(customer.totalSpentCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
