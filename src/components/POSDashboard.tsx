"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { apiFetch } from "@/components/pos/api";
import { LoginScreen } from "@/components/pos/LoginScreen";
import { PanelTab } from "@/components/pos/PanelTab";
import { PrintHistoryTab } from "@/components/pos/PrintHistoryTab";
import { ReportsTab } from "@/components/pos/ReportsTab";
import { SettingsTab } from "@/components/pos/SettingsTab";
import { ShiftTab } from "@/components/pos/ShiftTab";
import type {
  ActiveShiftPayload,
  DashboardTransaction,
  Employee,
  EncargoOrder,
  KpiReport,
  Machine,
  OwnerBrief,
  PaymentMethod,
  RelayHealth,
  ReportSummary,
  UtilizationRow,
  WorkOrderProcessResult
} from "@/components/pos/types";
import { ActivateModal } from "@/components/pos/modals/ActivateModal";
import { ChangePinModal } from "@/components/pos/modals/ChangePinModal";
import { NewEncargoModal } from "@/components/pos/modals/NewEncargoModal";
import { RunningModal } from "@/components/pos/modals/RunningModal";
import { TransactionDetailModal } from "@/components/pos/modals/TransactionDetailModal";

type TabId = "panel" | "corte" | "impresiones" | "reportes" | "graficas" | "config";
type ClearSessionOptions = {
  loginErrorMessage?: string | null;
};

const INACTIVITY_TIMEOUT_MS = 180_000;
const INACTIVITY_LOCK_MESSAGE = "Sesion bloqueada por inactividad (3 min).";
const INACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "touchstart", "wheel", "scroll"] as const;

const tabLabels: Record<TabId, string> = {
  panel: "Panel",
  corte: "Corte",
  impresiones: "Impresiones",
  reportes: "Reportes",
  graficas: "Graficas",
  config: "Configuracion"
};

const CASH_CAP_TOAST_MESSAGE = "Caja al tope: registra cash drop antes de la siguiente venta.";

function buildRange(daysBack = 2) {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - daysBack);
  return { from, to };
}

export function POSDashboard() {
  const [tab, setTab] = useState<TabId>("panel");
  const [pin, setPin] = useState("");
  const [sessionPin, setSessionPin] = useState<string | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [encargoOrders, setEncargoOrders] = useState<EncargoOrder[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<DashboardTransaction[]>([]);
  const [reportTransactions, setReportTransactions] = useState<DashboardTransaction[]>([]);
  const [relayHealth, setRelayHealth] = useState<RelayHealth | null>(null);
  const [activeShift, setActiveShift] = useState<ActiveShiftPayload>({ shift: null, summary: null });
  const [activateMachineId, setActivateMachineId] = useState<string | null>(null);
  const [runningMachineId, setRunningMachineId] = useState<string | null>(null);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const [showNewEncargo, setShowNewEncargo] = useState(false);
  const [preferredEncargoOrderId, setPreferredEncargoOrderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; tone: "success" | "error" | "info" }>>([]);
  const [ticker, setTicker] = useState(Date.now());
  const [reportFrom, setReportFrom] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [reportTo, setReportTo] = useState(() => new Date().toISOString().slice(0, 16));
  const [reportPeriod, setReportPeriod] = useState<"today" | "yesterday" | "last_7" | "this_month" | "custom">("today");
  const [reportSummary, setReportSummary] = useState<ReportSummary | null>(null);
  const [utilization, setUtilization] = useState<UtilizationRow[]>([]);
  const [kpiReport, setKpiReport] = useState<KpiReport | null>(null);
  const [ownerBrief, setOwnerBrief] = useState<OwnerBrief | null>(null);
  const [showChangePin, setShowChangePin] = useState(false);
  const isAdmin = employee?.isAdmin ?? false;
  const finishedTxIdsRef = useRef<Set<string>>(new Set());
  const audioCtxRef = useRef<AudioContext | null>(null);

  const adminHeaders = useMemo<Record<string, string>>(
    () => (sessionPin ? { "x-admin-pin": sessionPin } : ({} as Record<string, string>)),
    [sessionPin]
  );
  const availableTabs = useMemo(
    () =>
      isAdmin
        ? (["panel", "corte", "impresiones", "reportes", "graficas", "config"] as TabId[])
        : (["panel", "corte", "impresiones"] as TabId[]),
    [isAdmin]
  );
  const pushToast = useCallback((message: string, tone: "success" | "error" | "info" = "success") => {
    setToasts((current) => [...current, { id: Date.now() + Math.floor(Math.random() * 1000), message, tone }]);
  }, []);

  useEffect(() => {
    if (toasts.length === 0) {
      return;
    }
    const toastId = toasts[0]?.id;
    const timeout = window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== toastId));
    }, 2200);
    return () => window.clearTimeout(timeout);
  }, [toasts]);

  const selectedAvailable = useMemo(() => machines.find((machine) => machine.id === activateMachineId) ?? null, [activateMachineId, machines]);
  const selectedRunning = useMemo(() => machines.find((machine) => machine.id === runningMachineId) ?? null, [runningMachineId, machines]);
  const allTransactionsById = useMemo(() => {
    const map = new Map<string, DashboardTransaction>();
    for (const tx of [...recentTransactions, ...reportTransactions]) {
      map.set(tx.id, tx);
    }
    return map;
  }, [recentTransactions, reportTransactions]);
  const selectedTransaction = selectedTransactionId ? allTransactionsById.get(selectedTransactionId) ?? null : null;

  const playFinishChime = useCallback(() => {
    try {
      const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) {
        return;
      }
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContextCtor();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") {
        void ctx.resume();
      }
      const now = ctx.currentTime;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.25, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
      gain.connect(ctx.destination);

      const oscA = ctx.createOscillator();
      oscA.type = "sine";
      oscA.frequency.setValueAtTime(740, now);
      oscA.connect(gain);
      oscA.start(now);
      oscA.stop(now + 0.35);

      const oscB = ctx.createOscillator();
      oscB.type = "sine";
      oscB.frequency.setValueAtTime(988, now + 0.28);
      oscB.connect(gain);
      oscB.start(now + 0.28);
      oscB.stop(now + 0.9);
    } catch {
      // Sin audio soportado en el navegador.
    }
  }, []);

  const loadDashboard = useCallback(async () => {
    const range = buildRange(2);
    const txQuery = `from=${encodeURIComponent(range.from.toISOString())}&to=${encodeURIComponent(range.to.toISOString())}&limit=10`;

    const [machinesPayload, relayPayload, shiftPayload, txPayload, encargoPayload] = await Promise.all([
      apiFetch<{ machines: Machine[] }>("/api/machines"),
      apiFetch<{ health: RelayHealth }>("/api/system/relay"),
      apiFetch<ActiveShiftPayload>("/api/shifts/active", {
        headers: sessionPin ? { "x-session-pin": sessionPin } : undefined
      }),
      apiFetch<{ transactions: DashboardTransaction[] }>(`/api/transactions?${txQuery}`),
      apiFetch<{ orders: EncargoOrder[] }>("/api/encargo-orders")
    ]);

    setMachines(machinesPayload.machines);
    setRelayHealth(relayPayload.health);
    setActiveShift(shiftPayload);
    setRecentTransactions(txPayload.transactions);
    setEncargoOrders(encargoPayload.orders);

    const newFinishedIds = new Set<string>();
    for (const machine of machinesPayload.machines) {
      if (machine.status === "finished" && machine.transaction) {
        newFinishedIds.add(machine.transaction.id);
        if (!finishedTxIdsRef.current.has(machine.transaction.id)) {
          playFinishChime();
        }
      }
    }
    finishedTxIdsRef.current = newFinishedIds;
  }, [playFinishChime, sessionPin]);

  const loadEmployees = useCallback(async () => {
    if (!isAdmin) {
      setEmployees([]);
      return;
    }
    const payload = await apiFetch<{ employees: Employee[] }>("/api/settings/employees", {
      headers: adminHeaders
    });
    setEmployees(payload.employees);
  }, [adminHeaders, isAdmin]);

  const loadReports = useCallback(async () => {
    if (!isAdmin) {
      setReportSummary(null);
      setUtilization([]);
      setKpiReport(null);
      setOwnerBrief(null);
      setReportTransactions([]);
      return;
    }
    const customRangeQuery = `from=${encodeURIComponent(new Date(reportFrom).toISOString())}&to=${encodeURIComponent(new Date(reportTo).toISOString())}`;
    const periodQuery = reportPeriod === "custom" ? `period=custom&${customRangeQuery}` : `period=${reportPeriod}`;
    const summaryQuery = customRangeQuery;
    const [summaryPayload, utilizationPayload, txPayload] = await Promise.all([
      apiFetch<ReportSummary>(`/api/reports/summary?${summaryQuery}`, {
        headers: adminHeaders
      }),
      apiFetch<{ utilization: UtilizationRow[] }>(`/api/reports/utilization?${summaryQuery}`, {
        headers: adminHeaders
      }),
      apiFetch<{ transactions: DashboardTransaction[] }>(`/api/transactions?${summaryQuery}&limit=400`)
    ]);
    const [kpisPayload, briefPayload] = await Promise.all([
      apiFetch<KpiReport>(`/api/reports/kpis?${periodQuery}`, { headers: adminHeaders }),
      apiFetch<OwnerBrief>(`/api/reports/owner-brief?${periodQuery}`, { headers: adminHeaders })
    ]);
    setReportSummary(summaryPayload);
    setUtilization(utilizationPayload.utilization);
    setReportTransactions(txPayload.transactions);
    setKpiReport(kpisPayload);
    setOwnerBrief(briefPayload);
  }, [adminHeaders, isAdmin, reportFrom, reportPeriod, reportTo]);

  const exportReports = useCallback(async () => {
    if (!isAdmin || !sessionPin) {
      throw new Error("Solo administrador puede exportar");
    }

    const query = `from=${encodeURIComponent(new Date(reportFrom).toISOString())}&to=${encodeURIComponent(new Date(reportTo).toISOString())}&format=analytics_pack`;
    const response = await fetch(`/api/reports/export?${query}`, {
      headers: {
        "x-admin-pin": sessionPin
      }
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || "No fue posible exportar reporte");
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    const fromDate = new Date(reportFrom).toISOString().slice(0, 10);
    const toDate = new Date(reportTo).toISOString().slice(0, 10);
    link.download = `analytics_export_${fromDate}_${toDate}.zip`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  }, [isAdmin, reportFrom, reportTo, sessionPin]);

  useEffect(() => {
    setLoading(true);
    Promise.all(isAdmin ? [loadDashboard(), loadEmployees()] : [loadDashboard()])
      .catch((err) => setError(err instanceof Error ? err.message : "No fue posible cargar datos"))
      .finally(() => setLoading(false));
  }, [isAdmin, loadDashboard, loadEmployees]);

  useEffect(() => {
    const id = setInterval(() => {
      setTicker(Date.now());
      loadDashboard().catch(() => undefined);
      if ((tab === "reportes" || tab === "graficas") && isAdmin) {
        loadReports().catch(() => undefined);
      }
    }, 5000);
    return () => clearInterval(id);
  }, [isAdmin, loadDashboard, loadReports, tab]);

  useEffect(() => {
    const id = setInterval(() => setTicker(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const login = async () => {
    try {
      const payload = await apiFetch<Employee>("/api/auth/pin", {
        method: "POST",
        body: JSON.stringify({ pin })
      });
      setEmployee(payload);
      setSessionPin(pin);
      setTab("panel");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "PIN invalido");
    }
  };

  const clearSession = useCallback((options?: ClearSessionOptions) => {
    setEmployee(null);
    setSessionPin(null);
    setPin("");
    setTab("panel");
    setShowChangePin(false);
    setShowNewEncargo(false);
    setError(options?.loginErrorMessage ?? null);
    setMachines([]);
    setEmployees([]);
    setRelayHealth(null);
    setActiveShift({ shift: null, summary: null });
    setRecentTransactions([]);
    setReportTransactions([]);
    setEncargoOrders([]);
    setSelectedTransactionId(null);
    setRunningMachineId(null);
    setActivateMachineId(null);
    setPreferredEncargoOrderId(null);
    setToasts([]);
  }, []);

  const logout = useCallback(() => {
    clearSession();
  }, [clearSession]);

  useEffect(() => {
    if (!employee) {
      return;
    }

    let timeoutId = window.setTimeout(() => {
      clearSession({ loginErrorMessage: INACTIVITY_LOCK_MESSAGE });
    }, INACTIVITY_TIMEOUT_MS);

    const resetInactivityTimer = () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        clearSession({ loginErrorMessage: INACTIVITY_LOCK_MESSAGE });
      }, INACTIVITY_TIMEOUT_MS);
    };

    for (const eventName of INACTIVITY_EVENTS) {
      window.addEventListener(eventName, resetInactivityTimer, { passive: true });
    }

    return () => {
      window.clearTimeout(timeoutId);
      for (const eventName of INACTIVITY_EVENTS) {
        window.removeEventListener(eventName, resetInactivityTimer);
      }
    };
  }, [clearSession, employee]);

  const activate = async (
    machine: Machine,
    form: {
      customerId: string;
      customerName: string;
      baseAmountCents: number;
      durationMinutes: number;
      serviceType: "autoservicio" | "encargo" | "xl";
      paymentMethod: "cash" | "card" | "transfer";
      weightKg: number;
      encargoOrderId?: string;
      addons: {
        detergentQty: number;
        softenerQty: number;
        bleachQty: number;
      };
    }
  ) => {
    if (!employee) {
      return;
    }
    try {
      const result = await apiFetch<WorkOrderProcessResult>("/api/orders/process", {
        method: "POST",
        body: JSON.stringify({
          employeeId: employee.id,
          customerId: form.customerId,
          baseAmountCents: form.baseAmountCents,
          serviceType: form.serviceType,
          paymentMethod: form.paymentMethod,
          weightKg: form.weightKg,
          encargoOrderId: form.encargoOrderId,
          addons: form.addons
        })
      });

      if (result.workOrder) {
        pushToast(`Orden #${result.workOrder.orderNumber} creada (${result.workOrder.requiredLoads} cargas).`, "success");
      }
      if (result.relayFailures.length > 0) {
        const relayMessage = `Orden creada, pero ${result.relayFailures.length} carga(s) no encendieron relay.`;
        setError(relayMessage);
        pushToast(relayMessage, "error");
      } else {
        setError(null);
      }
      if (result.printFailures.length > 0) {
        const retryResults = await Promise.allSettled(
          result.printFailures.map((row) =>
            apiFetch<{ job: { id: string } }>(`/api/print-jobs/${row.id}/retry`, {
              method: "POST",
              headers: sessionPin ? { "x-session-pin": sessionPin } : undefined
            })
          )
        );
        const retriedOk = retryResults.filter((item) => item.status === "fulfilled").length;
        const stillFailed = result.printFailures.length - retriedOk;
        const printMessage =
          stillFailed > 0
            ? `Impresion: ${retriedOk} recuperado(s), ${stillFailed} aun fallan.`
            : `Impresion recuperada automaticamente (${retriedOk} ticket(s)).`;
        setError(stillFailed > 0 ? printMessage : null);
        pushToast(printMessage, stillFailed > 0 ? "error" : "success");
      }

      setActivateMachineId(null);
      setPreferredEncargoOrderId(null);
      await loadDashboard();
    } catch (err) {
      const message = err instanceof Error ? err.message : "No fue posible activar maquina";
      const normalized = message.toLowerCase();
      const isCashCapError = normalized.includes("caja al tope") || (normalized.includes("cash drop") && normalized.includes("venta"));
      const userMessage = isCashCapError ? CASH_CAP_TOAST_MESSAGE : message;
      setError(userMessage);
      pushToast(userMessage, "error");
    }
  };

  const addTime = async (input: {
    transactionId: string;
    extraMinutes: number;
    extraAmountCents: number;
    paymentMethod: PaymentMethod;
  }) => {
    if (!employee) {
      return;
    }
    await apiFetch(`/api/transactions/${input.transactionId}/extend`, {
      method: "POST",
      body: JSON.stringify({
        employeeId: employee.id,
        extraMinutes: input.extraMinutes,
        extraAmountCents: input.extraAmountCents,
        paymentMethod: input.paymentMethod
      })
    });
    await loadDashboard();
  };

  const voidTransaction = async (input: { transactionId: string; reason: string; adminPin?: string }) => {
    if (!employee) {
      return;
    }

    const adminPinToUse = input.adminPin || (employee.isAdmin ? sessionPin ?? undefined : undefined);
    await apiFetch(`/api/transactions/${input.transactionId}/void`, {
      method: "POST",
      headers: adminPinToUse ? { "x-admin-pin": adminPinToUse } : undefined,
      body: JSON.stringify({
        employeeId: employee.id,
        reason: input.reason
      })
    });
    await loadDashboard();
    if (tab === "reportes" && isAdmin) {
      await loadReports();
    }
  };

  const releaseMachine = async (machineId: string) => {
    await apiFetch(`/api/machines/${machineId}/release`, {
      method: "POST"
    });
    setRunningMachineId(null);
    await loadDashboard();
  };

  const updateEncargoStatus = async (input: { orderId: string; status: EncargoOrder["status"]; paymentMethod?: PaymentMethod }) => {
    try {
      await apiFetch(`/api/encargo-orders/${input.orderId}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: input.status,
          paymentMethod: input.paymentMethod
        })
      });
      await loadDashboard();
      const statusLabel =
        input.status === "processing" ? "processing" : input.status === "ready" ? "ready" : input.status === "picked_up" ? "picked up" : "order";
      pushToast(`Encargo marcado como ${statusLabel}`, "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "No fue posible actualizar encargo";
      setError(message);
      pushToast(message, "error");
    }
  };

  if (!employee) {
    return <LoginScreen pin={pin} error={error} onPinChange={setPin} onLogin={login} />;
  }

  return (
    <main className="mx-auto min-h-screen max-w-[1400px] px-4 py-4 lg:px-8">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/90 px-5 py-4 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-teal-900">Punto Lavado POS</h1>
          <p className="text-sm text-slate-600">Cajero: {employee.name}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <nav className="flex gap-2">
            {availableTabs.map((key) => (
              <button
                key={key}
                onClick={() => {
                  setTab(key);
                  if ((key === "reportes" || key === "graficas") && isAdmin) {
                    loadReports().catch(() => undefined);
                  }
                }}
                className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab === key ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-700"}`}
              >
                {tabLabels[key]}
              </button>
            ))}
          </nav>
          <button onClick={() => setShowChangePin(true)} className="rounded-xl bg-slate-700 px-3 py-2 text-sm font-semibold text-white">
            Cambiar PIN
          </button>
          <button onClick={logout} className="rounded-xl bg-slate-200 px-3 py-2 text-sm font-semibold text-slate-800">
            Cerrar sesion
          </button>
        </div>
      </header>

      {relayHealth && (
        <section
          className={`mb-4 rounded-xl px-4 py-3 text-sm font-semibold ${relayHealth.connected ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}
        >
          Hardware NODE-RED: {relayHealth.connected ? "Conectado" : "Desconectado"}
          {relayHealth.error ? ` (${relayHealth.error})` : ""}
        </section>
      )}
      {error && <p className="mb-4 rounded-xl bg-red-100 px-4 py-3 text-sm text-red-700">{error}</p>}
      {loading && <p className="mb-4 text-sm text-slate-500">Cargando datos...</p>}
      {toasts.length > 0 && (
        <section className="pointer-events-none fixed right-4 top-4 z-[60] flex w-full max-w-sm flex-col gap-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`rounded-xl px-4 py-3 text-sm font-semibold shadow-lg ${
                toast.tone === "success"
                  ? "bg-emerald-600 text-white"
                  : toast.tone === "error"
                    ? "bg-red-600 text-white"
                    : "bg-slate-800 text-white"
              }`}
            >
              {toast.message}
            </div>
          ))}
        </section>
      )}

      {tab === "panel" && (
        <PanelTab
          machines={machines}
          ticker={ticker}
          recentTransactions={recentTransactions}
          encargoOrders={encargoOrders}
          onSelectAvailable={setActivateMachineId}
          onSelectRunning={setRunningMachineId}
          onSelectTransaction={setSelectedTransactionId}
          onCreateEncargo={() => setShowNewEncargo(true)}
          onAssignEncargoToMachine={(orderId) => {
            setPreferredEncargoOrderId(orderId);
            pushToast("Encargo listo: ahora toca una lavadora disponible para activarlo", "info");
          }}
          onUpdateEncargoStatus={updateEncargoStatus}
        />
      )}

      {tab === "corte" && (
        <ShiftTab
          employee={employee}
          adminPin={sessionPin}
          activeShift={activeShift}
          onRefresh={loadDashboard}
          onError={setError}
          onShiftClosed={logout}
        />
      )}

      {tab === "impresiones" && (
        <PrintHistoryTab
          sessionPin={sessionPin}
          onError={setError}
          onToast={pushToast}
        />
      )}

      {tab === "reportes" && isAdmin && (
        <ReportsTab
          mode="reportes"
          reportFrom={reportFrom}
          reportTo={reportTo}
          reportPeriod={reportPeriod}
          setReportFrom={setReportFrom}
          setReportTo={setReportTo}
          setReportPeriod={setReportPeriod}
          summary={reportSummary}
          utilization={utilization}
          kpiReport={kpiReport}
          ownerBrief={ownerBrief}
          transactions={reportTransactions}
          onSelectTransaction={setSelectedTransactionId}
          onLoad={loadReports}
          onExport={exportReports}
        />
      )}

      {tab === "graficas" && isAdmin && (
        <ReportsTab
          mode="graficas"
          reportFrom={reportFrom}
          reportTo={reportTo}
          reportPeriod={reportPeriod}
          setReportFrom={setReportFrom}
          setReportTo={setReportTo}
          setReportPeriod={setReportPeriod}
          summary={reportSummary}
          utilization={utilization}
          kpiReport={kpiReport}
          ownerBrief={ownerBrief}
          transactions={reportTransactions}
          onSelectTransaction={setSelectedTransactionId}
          onLoad={loadReports}
          onExport={exportReports}
        />
      )}

      {tab === "config" && isAdmin && sessionPin && (
        <SettingsTab
          employee={employee}
          adminPin={sessionPin}
          employees={employees}
          onRefresh={async () => {
            await Promise.all([loadDashboard(), loadEmployees()]);
          }}
          onError={setError}
        />
      )}

      {selectedAvailable && (
        <ActivateModal
          machine={selectedAvailable}
          encargoOrders={encargoOrders}
          preferredEncargoOrderId={preferredEncargoOrderId ?? undefined}
          onCancel={() => {
            setActivateMachineId(null);
            setPreferredEncargoOrderId(null);
          }}
          onConfirm={activate}
        />
      )}

      {selectedRunning && selectedRunning.transaction && (
        <RunningModal
          machine={selectedRunning}
          ticker={ticker}
          onClose={() => setRunningMachineId(null)}
          onAddTime={addTime}
          onVoidTransaction={voidTransaction}
          onReleaseMachine={releaseMachine}
        />
      )}

      {selectedTransaction && (
        <TransactionDetailModal
          transaction={selectedTransaction}
          onClose={() => setSelectedTransactionId(null)}
          onVoid={voidTransaction}
        />
      )}

      {showNewEncargo && (
        <NewEncargoModal
          employeeId={employee.id}
          onClose={() => setShowNewEncargo(false)}
          onCreated={async (order) => {
            setShowNewEncargo(false);
            setPreferredEncargoOrderId(order.id);
            pushToast("Encargo creado. Ahora selecciona una lavadora para asignarlo", "success");
            await loadDashboard();
          }}
        />
      )}

      {showChangePin && (
        <ChangePinModal
          employee={employee}
          onClose={() => setShowChangePin(false)}
          onSuccess={(newPin) => {
            setSessionPin(newPin);
            setShowChangePin(false);
            setError(null);
          }}
          onError={setError}
        />
      )}

    </main>
  );
}
