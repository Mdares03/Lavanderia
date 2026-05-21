"use client";

import { useCallback, useEffect, useState } from "react";

import { apiFetch } from "@/components/pos/api";
import type {
  AdminMachine,
  CustomerRecord,
  Employee,
  PricingVariables,
  RelayChannelConfig,
  RelayChannelConfigUpdate
} from "@/components/pos/types";
import { formatCurrency } from "@/lib/format";

type SettingsTabProps = {
  employee: Employee;
  adminPin: string;
  employees: Employee[];
  onRefresh: () => Promise<void>;
  onError: (value: string) => void;
};

export function SettingsTab({ employee, adminPin, employees, onRefresh, onError }: SettingsTabProps) {
  const [newEmployeeName, setNewEmployeeName] = useState("");
  const [newEmployeePin, setNewEmployeePin] = useState("");
  const [newEmployeeIsAdmin, setNewEmployeeIsAdmin] = useState(false);
  const [newMachineName, setNewMachineName] = useState("");
  const [newMachineType, setNewMachineType] = useState<"washer" | "dryer">("washer");
  const [newMachineSize, setNewMachineSize] = useState<"normal" | "xl">("normal");
  const [newMachineRelayChannel, setNewMachineRelayChannel] = useState("");
  const [newMachinePrice, setNewMachinePrice] = useState("");
  const [newMachineDuration, setNewMachineDuration] = useState("");
  const [newMachineActive, setNewMachineActive] = useState(false);
  const [adminMachines, setAdminMachines] = useState<AdminMachine[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [bulkPrice, setBulkPrice] = useState("");
  const [bulkDuration, setBulkDuration] = useState("");
  const [machineDrafts, setMachineDrafts] = useState<
    Record<
      string,
      {
        name: string;
        type: "washer" | "dryer";
        size: "normal" | "xl";
        relayChannel: string;
        price: number;
        duration: number;
        outOfService: boolean;
        isActive: boolean;
      }
    >
  >({});
  const [pricing, setPricing] = useState<PricingVariables | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [showMachineList, setShowMachineList] = useState(false);
  const [testingMachineId, setTestingMachineId] = useState<string | null>(null);
  const [testingAllRelays, setTestingAllRelays] = useState(false);
  const [relayTestFeedback, setRelayTestFeedback] = useState<string | null>(null);
  const [relayConfigLoading, setRelayConfigLoading] = useState(false);
  const [relayConfigSaving, setRelayConfigSaving] = useState(false);
  const [relayConfigRows, setRelayConfigRows] = useState<RelayChannelConfig[]>([]);
  const [relayConfigDrafts, setRelayConfigDrafts] = useState<Record<number, { label: string; enabled: boolean }>>({});

  const loadAdminMachines = useCallback(async () => {
    setCatalogLoading(true);
    try {
      const payload = await apiFetch<{ machines: AdminMachine[] }>("/api/machines/catalog", {
        headers: {
          "x-admin-pin": adminPin
        }
      });
      setAdminMachines(payload.machines);
    } finally {
      setCatalogLoading(false);
    }
  }, [adminPin]);

  const loadRelayConfig = useCallback(async () => {
    setRelayConfigLoading(true);
    try {
      const payload = await apiFetch<{ channels: RelayChannelConfig[] }>("/api/system/relay/config/channels", {
        headers: {
          "x-admin-pin": adminPin
        }
      });
      setRelayConfigRows(payload.channels);
      setRelayConfigDrafts(
        payload.channels.reduce<Record<number, { label: string; enabled: boolean }>>((acc, row) => {
          acc[row.channel] = { label: row.label, enabled: row.enabled };
          return acc;
        }, {})
      );
    } catch (error) {
      onError(error instanceof Error ? error.message : "No fue posible cargar mapeo Node-RED");
    } finally {
      setRelayConfigLoading(false);
    }
  }, [adminPin, onError]);

  useEffect(() => {
    if (adminMachines.length === 0) {
      return;
    }
    const firstActive = adminMachines.find((machine) => machine.isActive) ?? adminMachines[0];
    if (!bulkPrice) {
      setBulkPrice((firstActive.defaultPriceCents / 100).toString());
    }
    if (!bulkDuration) {
      setBulkDuration(firstActive.defaultDurationMinutes.toString());
    }
  }, [adminMachines, bulkDuration, bulkPrice]);

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

  useEffect(() => {
    loadAdminMachines().catch(() => undefined);
  }, [loadAdminMachines]);

  useEffect(() => {
    loadRelayConfig().catch(() => undefined);
  }, [loadRelayConfig]);

  const getMachineDraft = (machine: AdminMachine) =>
    machineDrafts[machine.id] ?? {
      name: machine.name,
      type: machine.type,
      size: machine.size,
      relayChannel: machine.relayChannel?.toString() ?? "",
      price: machine.defaultPriceCents / 100,
      duration: machine.defaultDurationMinutes,
      outOfService: machine.outOfService,
      isActive: machine.isActive
    };

  const activeMachines = adminMachines.filter((machine) => machine.isActive);
  const inactiveMachines = adminMachines.filter((machine) => !machine.isActive);
  const activeWashers = activeMachines.filter((machine) => machine.type === "washer");
  const activeDryers = activeMachines.filter((machine) => machine.type === "dryer");
  const hardwareReadyCount = adminMachines.filter((machine) => machine.hardware.ready).length;
  const pendingHardwareCount = adminMachines.filter(
    (machine) => !machine.hardware.ready && (machine.hardware.backend === "pending" || machine.hardware.error === "channel_not_wired")
  ).length;

  const machineHardwareLabel = (machine: AdminMachine) => {
    if (machine.hardware.ready) return "Lista";
    if (machine.hardware.error === "channel_unassigned") return "Sin canal";
    if (machine.hardware.backend === "pending" || machine.hardware.error === "channel_not_wired") return "Pendiente de relay";
    return "No disponible";
  };

  const machineHardwareBadgeClass = (machine: AdminMachine) => {
    if (machine.hardware.ready) return "bg-emerald-100 text-emerald-700";
    if (machine.hardware.error === "channel_unassigned") return "bg-slate-200 text-slate-700";
    if (machine.hardware.backend === "pending" || machine.hardware.error === "channel_not_wired") return "bg-violet-100 text-violet-700";
    return "bg-rose-100 text-rose-700";
  };

  const relayTestText = (machine: AdminMachine) => {
    if (!machine.relayTest.lastRelayTestAt) return "Sin prueba";
    if (machine.relayTest.lastRelayTestOk) return "OK";
    return `Fallo: ${machine.relayTest.lastRelayTestError ?? "sin detalle"}`;
  };

  const refreshAll = async () => {
    await Promise.all([onRefresh(), loadAdminMachines(), loadRelayConfig()]);
  };

  const relayConfigDirty = relayConfigRows.some((row) => {
    const draft = relayConfigDrafts[row.channel];
    return !!draft && (draft.label !== row.label || draft.enabled !== row.enabled);
  });

  const backendLabel = (row: RelayChannelConfig) => {
    if (row.backend === "i2c") return "i2c";
    if (row.backend === "modbus") return "modbus";
    return "pending";
  };

  const locationLabel = (row: RelayChannelConfig) => {
    if (row.backend === "i2c") {
      return `board ${row.board ?? 0} / relay ${row.relay ?? "-"}`;
    }
    if (row.backend === "modbus") {
      return `addr ${row.addr ?? "-"} / relay ${row.relay ?? "-"}`;
    }
    return "-";
  };

  const renderMachineItem = (machine: AdminMachine) => {
    const draft = getMachineDraft(machine);
    return (
      <li key={machine.id} className="rounded-lg bg-slate-100 px-3 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-semibold">{machine.name}</p>
            <p className="text-xs text-slate-600">
              {machine.type === "washer" ? "Lavadora" : "Secadora"} · {machine.size === "xl" ? "XL" : "Normal"} · Canal{" "}
              {machine.relayChannel ?? "-"}
            </p>
          </div>
          <span className={`rounded-lg px-2 py-1 text-[11px] font-semibold ${machineHardwareBadgeClass(machine)}`}>{machineHardwareLabel(machine)}</span>
        </div>
        <p className="mt-2 text-xs text-slate-600">Ultima prueba: {relayTestText(machine)}</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <input
            value={draft.name}
            onChange={(event) =>
              setMachineDrafts((current) => ({
                ...current,
                [machine.id]: { ...draft, name: event.target.value }
              }))
            }
            className="rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Nombre"
          />
          <input
            value={draft.relayChannel}
            onChange={(event) =>
              setMachineDrafts((current) => ({
                ...current,
                [machine.id]: { ...draft, relayChannel: event.target.value }
              }))
            }
            className="rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Canal relay (vacío=sin canal)"
          />
          <select
            value={draft.type}
            onChange={(event) =>
              setMachineDrafts((current) => ({
                ...current,
                [machine.id]: { ...draft, type: event.target.value as "washer" | "dryer" }
              }))
            }
            className="rounded-lg border border-slate-300 px-3 py-2"
          >
            <option value="washer">Lavadora</option>
            <option value="dryer">Secadora</option>
          </select>
          <select
            value={draft.size}
            onChange={(event) =>
              setMachineDrafts((current) => ({
                ...current,
                [machine.id]: { ...draft, size: event.target.value as "normal" | "xl" }
              }))
            }
            className="rounded-lg border border-slate-300 px-3 py-2"
          >
            <option value="normal">Normal</option>
            <option value="xl">XL</option>
          </select>
          <input
            type="number"
            min={1}
            value={draft.price}
            onChange={(event) =>
              setMachineDrafts((current) => ({
                ...current,
                [machine.id]: { ...draft, price: Number(event.target.value || 0) }
              }))
            }
            className="rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Precio"
          />
          <input
            type="number"
            min={1}
            value={draft.duration}
            onChange={(event) =>
              setMachineDrafts((current) => ({
                ...current,
                [machine.id]: { ...draft, duration: Number(event.target.value || 0) }
              }))
            }
            className="rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Minutos"
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(event) =>
                setMachineDrafts((current) => ({
                  ...current,
                  [machine.id]: { ...draft, isActive: event.target.checked }
                }))
              }
            />
            Activa
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.outOfService}
              onChange={(event) =>
                setMachineDrafts((current) => ({
                  ...current,
                  [machine.id]: { ...draft, outOfService: event.target.checked }
                }))
              }
            />
            Fuera de servicio
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={async () => {
              const relayValue = draft.relayChannel.trim();
              const relayChannel = relayValue.length === 0 ? null : Number(relayValue);
              if (relayChannel !== null && (!Number.isInteger(relayChannel) || relayChannel < 1 || relayChannel > 63)) {
                onError("Canal de relay invalido. Usa 1..63.");
                return;
              }

              try {
                await apiFetch(`/api/machines/${machine.id}`, {
                  method: "PATCH",
                  headers: {
                    "x-admin-pin": adminPin
                  },
                  body: JSON.stringify({
                    name: draft.name.trim(),
                    type: draft.type,
                    size: draft.size,
                    relayChannel,
                    defaultPriceCents: Math.round(draft.price * 100),
                    defaultDurationMinutes: Math.round(draft.duration),
                    outOfService: draft.outOfService,
                    isActive: draft.isActive
                  })
                });
                await refreshAll();
              } catch (error) {
                onError(error instanceof Error ? error.message : "No fue posible actualizar maquina");
              }
            }}
            className="rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white"
          >
            Guardar
          </button>
          <button
            onClick={async () => {
              setTestingMachineId(machine.id);
              try {
                const payload = await apiFetch<{ activated: boolean }>(`/api/machines/${machine.id}/test-relay`, {
                  method: "POST",
                  headers: {
                    "x-admin-pin": adminPin
                  }
                });
                setRelayTestFeedback(payload.activated ? `Relay OK y maquina activada: ${machine.name}` : `Relay OK: ${machine.name}`);
                await refreshAll();
              } catch (error) {
                onError(error instanceof Error ? error.message : "No fue posible probar relay");
              } finally {
                setTestingMachineId(null);
              }
            }}
            className="rounded-lg bg-indigo-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
            disabled={testingMachineId === machine.id || testingAllRelays}
          >
            {testingMachineId === machine.id ? "Probando..." : "Probar relay"}
          </button>
          <button
            onClick={async () => {
              try {
                await apiFetch(`/api/machines/${machine.id}/remove`, {
                  method: "POST",
                  headers: {
                    "x-admin-pin": adminPin
                  }
                });
                await refreshAll();
              } catch (error) {
                onError(error instanceof Error ? error.message : "No fue posible remover maquina");
              }
            }}
            className="rounded-lg bg-amber-700 px-3 py-2 text-xs font-semibold text-white"
          >
            Quitar (inactiva)
          </button>
        </div>
      </li>
    );
  };

  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <article className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900">Maquinas</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Total catalogo</p>
            <p className="font-semibold text-slate-900">{adminMachines.length}</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
            <p className="text-xs uppercase tracking-wide text-emerald-700">Hardware listo</p>
            <p className="font-semibold text-emerald-900">{hardwareReadyCount}</p>
          </div>
          <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm">
            <p className="text-xs uppercase tracking-wide text-violet-700">Pendiente de relay</p>
            <p className="font-semibold text-violet-900">{pendingHardwareCount}</p>
          </div>
        </div>
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm font-semibold text-slate-800">Aplicar valor global a activas</p>
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
                  await refreshAll();
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
              {showMachineList ? "Ocultar lista" : `Mostrar lista (${adminMachines.length})`}
            </button>
          </div>
        </div>
        {relayTestFeedback && <p className="mt-2 text-xs font-semibold text-emerald-700">{relayTestFeedback}</p>}
        {catalogLoading && <p className="mt-2 text-xs text-slate-500">Cargando catalogo...</p>}
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm font-semibold text-slate-800">Agregar maquina</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <input
              value={newMachineName}
              onChange={(event) => setNewMachineName(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2"
              placeholder="Nombre"
            />
            <input
              value={newMachineRelayChannel}
              onChange={(event) => setNewMachineRelayChannel(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2"
              placeholder="Canal relay (vacío permitido)"
            />
            <select value={newMachineType} onChange={(event) => setNewMachineType(event.target.value as "washer" | "dryer")} className="rounded-lg border border-slate-300 px-3 py-2">
              <option value="washer">Lavadora</option>
              <option value="dryer">Secadora</option>
            </select>
            <select value={newMachineSize} onChange={(event) => setNewMachineSize(event.target.value as "normal" | "xl")} className="rounded-lg border border-slate-300 px-3 py-2">
              <option value="normal">Normal</option>
              <option value="xl">XL</option>
            </select>
            <input
              type="number"
              min={1}
              value={newMachinePrice}
              onChange={(event) => setNewMachinePrice(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2"
              placeholder="Precio MXN"
            />
            <input
              type="number"
              min={1}
              value={newMachineDuration}
              onChange={(event) => setNewMachineDuration(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2"
              placeholder="Duracion minutos"
            />
          </div>
          <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={newMachineActive} onChange={(event) => setNewMachineActive(event.target.checked)} />
            Crear activa
          </label>
          <button
            onClick={async () => {
              const relayValue = newMachineRelayChannel.trim();
              const relayChannel = relayValue.length === 0 ? null : Number(relayValue);
              if (!newMachineName.trim()) {
                onError("Nombre de maquina requerido");
                return;
              }
              if (!newMachinePrice.trim() || Number(newMachinePrice) <= 0) {
                onError("Precio invalido");
                return;
              }
              if (relayChannel !== null && (!Number.isInteger(relayChannel) || relayChannel < 1 || relayChannel > 63)) {
                onError("Canal de relay invalido. Usa 1..63.");
                return;
              }

              try {
                await apiFetch("/api/machines", {
                  method: "POST",
                  headers: {
                    "x-admin-pin": adminPin
                  },
                  body: JSON.stringify({
                    name: newMachineName.trim(),
                    type: newMachineType,
                    size: newMachineSize,
                    relayChannel,
                    defaultPriceCents: Math.round(Number(newMachinePrice) * 100),
                    defaultDurationMinutes: newMachineDuration.trim().length > 0 ? Math.round(Number(newMachineDuration)) : undefined,
                    isActive: newMachineActive
                  })
                });
                setNewMachineName("");
                setNewMachineRelayChannel("");
                setNewMachinePrice("");
                setNewMachineDuration("");
                setNewMachineType("washer");
                setNewMachineSize("normal");
                setNewMachineActive(false);
                await refreshAll();
              } catch (error) {
                onError(error instanceof Error ? error.message : "No fue posible crear maquina");
              }
            }}
            className="mt-2 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white"
          >
            Agregar maquina
          </button>
        </div>
        {showMachineList && (
          <div className="mt-3 grid gap-3 text-sm">
            <details className="rounded-xl border border-slate-200 bg-white p-3" open>
              <summary className="cursor-pointer font-semibold text-slate-800">Lavadoras activas ({activeWashers.length})</summary>
              <ul className="mt-3 grid gap-2">{activeWashers.map(renderMachineItem)}</ul>
            </details>
            <details className="rounded-xl border border-slate-200 bg-white p-3">
              <summary className="cursor-pointer font-semibold text-slate-800">Secadoras activas ({activeDryers.length})</summary>
              <ul className="mt-3 grid gap-2">{activeDryers.map(renderMachineItem)}</ul>
            </details>
            <details className="rounded-xl border border-slate-200 bg-white p-3">
              <summary className="cursor-pointer font-semibold text-slate-800">Inactivas ({inactiveMachines.length})</summary>
              <ul className="mt-3 grid gap-2">{inactiveMachines.map(renderMachineItem)}</ul>
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
        <h2 className="text-xl font-bold text-slate-900">Estado de hardware</h2>
        <p className="mt-2 text-sm text-slate-600">
          Los canales marcados como <strong>Pendiente de relay</strong> existen en catalogo pero aun no tienen hardware instalado.
        </p>
        <p className="mt-2 text-xs text-slate-500">Cuando lleguen nuevos relays, actualiza el mapeo en Node-RED para habilitar esos canales.</p>
      </article>

      <article className="rounded-2xl bg-white p-5 shadow-sm lg:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Mapeo Node-RED</h2>
            <p className="mt-1 text-xs text-slate-600">Edita solo etiqueta y habilitacion. Backend/direccion/relay se gestionan automaticamente.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadRelayConfig().catch(() => undefined)}
              className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white"
            >
              Recargar
            </button>
            <button
              onClick={async () => {
                const updates: RelayChannelConfigUpdate[] = [];
                for (const row of relayConfigRows) {
                  const draft = relayConfigDrafts[row.channel];
                  if (!draft) continue;
                  if (draft.label !== row.label || draft.enabled !== row.enabled) {
                    updates.push({
                      channel: row.channel,
                      label: draft.label.trim(),
                      enabled: draft.enabled
                    });
                  }
                }
                if (updates.length === 0) {
                  setRelayTestFeedback("Sin cambios en mapeo Node-RED");
                  return;
                }

                if (updates.some((row) => !row.label || row.label.length === 0)) {
                  onError("Cada canal debe tener etiqueta");
                  return;
                }

                setRelayConfigSaving(true);
                try {
                  await apiFetch<{ channels: RelayChannelConfig[] }>("/api/system/relay/config/channels", {
                    method: "PUT",
                    headers: {
                      "x-admin-pin": adminPin
                    },
                    body: JSON.stringify({ channels: updates })
                  });
                  setRelayTestFeedback(`Mapeo actualizado: ${updates.length} canal(es)`);
                  await refreshAll();
                } catch (error) {
                  onError(error instanceof Error ? error.message : "No fue posible guardar mapeo Node-RED");
                } finally {
                  setRelayConfigSaving(false);
                }
              }}
              disabled={relayConfigSaving || !relayConfigDirty}
              className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
            >
              {relayConfigSaving ? "Guardando..." : "Guardar mapeo"}
            </button>
          </div>
        </div>
        {relayConfigLoading ? (
          <p className="mt-3 text-xs text-slate-500">Cargando mapeo...</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  <th className="px-3 py-2 text-left">Canal</th>
                  <th className="px-3 py-2 text-left">Etiqueta</th>
                  <th className="px-3 py-2 text-left">Habilitado</th>
                  <th className="px-3 py-2 text-left">Backend</th>
                  <th className="px-3 py-2 text-left">Ubicacion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {relayConfigRows.map((row) => {
                  const draft = relayConfigDrafts[row.channel] ?? { label: row.label, enabled: row.enabled };
                  return (
                    <tr key={row.channel}>
                      <td className="px-3 py-2 font-semibold text-slate-900">{row.channel}</td>
                      <td className="px-3 py-2">
                        <input
                          value={draft.label}
                          onChange={(event) =>
                            setRelayConfigDrafts((current) => ({
                              ...current,
                              [row.channel]: {
                                ...draft,
                                label: event.target.value
                              }
                            }))
                          }
                          className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <label className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={draft.enabled}
                            onChange={(event) =>
                              setRelayConfigDrafts((current) => ({
                                ...current,
                                [row.channel]: {
                                  ...draft,
                                  enabled: event.target.checked
                                }
                              }))
                            }
                          />
                          {draft.enabled ? "Si" : "No"}
                        </label>
                      </td>
                      <td className="px-3 py-2 text-slate-700">{backendLabel(row)}</td>
                      <td className="px-3 py-2 text-slate-700">{locationLabel(row)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </article>

      {pricing && (
        <article className="rounded-2xl bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="text-xl font-bold text-slate-900">Variables de precio</h2>
          <p className="mt-1 text-xs text-slate-600">Configuracion por categoria de servicio</p>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <h3 className="text-sm font-semibold text-slate-800">Duracion por tipo de maquina</h3>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <label className="grid gap-1 text-xs">
                  <span className="font-medium text-slate-700">Lavadora normal (min)</span>
                  <input
                    type="number"
                    min={1}
                    value={pricing.washerNormalCycleMinutes}
                    onChange={(event) =>
                      setPricing((current) =>
                        current ? { ...current, washerNormalCycleMinutes: Math.round(Number(event.target.value || 0)) } : current
                      )
                    }
                    className="rounded-xl border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="grid gap-1 text-xs">
                  <span className="font-medium text-slate-700">Lavadora XL (min)</span>
                  <input
                    type="number"
                    min={1}
                    value={pricing.washerXlCycleMinutes}
                    onChange={(event) =>
                      setPricing((current) =>
                        current ? { ...current, washerXlCycleMinutes: Math.round(Number(event.target.value || 0)) } : current
                      )
                    }
                    className="rounded-xl border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="grid gap-1 text-xs">
                  <span className="font-medium text-slate-700">Secadora normal (min)</span>
                  <input
                    type="number"
                    min={1}
                    value={pricing.dryerNormalCycleMinutes}
                    onChange={(event) =>
                      setPricing((current) =>
                        current ? { ...current, dryerNormalCycleMinutes: Math.round(Number(event.target.value || 0)) } : current
                      )
                    }
                    className="rounded-xl border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="grid gap-1 text-xs">
                  <span className="font-medium text-slate-700">Secadora XL (min)</span>
                  <input
                    type="number"
                    min={1}
                    value={pricing.dryerXlCycleMinutes}
                    onChange={(event) =>
                      setPricing((current) =>
                        current ? { ...current, dryerXlCycleMinutes: Math.round(Number(event.target.value || 0)) } : current
                      )
                    }
                    className="rounded-xl border border-slate-300 px-3 py-2"
                  />
                </label>
              </div>
            </article>

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
