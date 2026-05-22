"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { apiFetch } from "@/components/pos/api";
import type { PrintHistoryItem, PrintHistoryResponse, PrintJobStatusFilter } from "@/components/pos/types";
import { formatDateTime } from "@/lib/format";

type PrintHistoryTabProps = {
  sessionPin: string | null;
  onError: (value: string | null) => void;
  onToast: (message: string, tone?: "success" | "error" | "info") => void;
};

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function rangeToIso(fromDate: string, toDate: string) {
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T23:59:59.999`);
  return {
    from: from.toISOString(),
    to: to.toISOString()
  };
}

function ticketTypeLabel(value: PrintHistoryItem["ticketType"]) {
  if (value === "master_customer") return "Master cliente";
  if (value === "master_store") return "Master tienda";
  return "Etiqueta carga";
}

function statusLabel(value: PrintHistoryItem["status"]) {
  if (value === "printed") return "Impreso";
  if (value === "failed") return "Fallido";
  return "Pendiente";
}

function statusBadgeClass(value: PrintHistoryItem["status"]) {
  if (value === "printed") return "bg-emerald-100 text-emerald-800";
  if (value === "failed") return "bg-red-100 text-red-800";
  return "bg-amber-100 text-amber-800";
}

export function PrintHistoryTab({ sessionPin, onError, onToast }: PrintHistoryTabProps) {
  const today = useMemo(() => new Date(), []);
  const initialFrom = useMemo(() => {
    const from = new Date(today);
    from.setDate(from.getDate() - 6);
    return toDateInputValue(from);
  }, [today]);

  const [fromDate, setFromDate] = useState(initialFrom);
  const [toDate, setToDate] = useState(toDateInputValue(today));
  const [status, setStatus] = useState<PrintJobStatusFilter>("all");
  const [workOrderNumber, setWorkOrderNumber] = useState("");
  const [items, setItems] = useState<PrintHistoryItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryingFailed, setRetryingFailed] = useState(false);
  const [selectedPreview, setSelectedPreview] = useState<PrintHistoryItem | null>(null);

  const buildQuery = useCallback(
    (nextCursor?: string) => {
      const { from, to } = rangeToIso(fromDate, toDate);
      const params = new URLSearchParams({
        from,
        to,
        status,
        limit: "50"
      });

      const normalizedOrder = workOrderNumber.trim();
      if (normalizedOrder.length > 0) {
        params.set("workOrderNumber", normalizedOrder);
      }
      if (nextCursor) {
        params.set("cursor", nextCursor);
      }
      return params;
    },
    [fromDate, status, toDate, workOrderNumber]
  );

  const fetchJobs = useCallback(
    async (mode: "replace" | "append") => {
      if (!sessionPin) {
        return;
      }

      if (mode === "replace") {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      try {
        const params = buildQuery(mode === "append" ? cursor ?? undefined : undefined);
        const payload = await apiFetch<PrintHistoryResponse>(`/api/print-jobs?${params.toString()}`, {
          headers: { "x-session-pin": sessionPin }
        });

        setItems((current) => (mode === "replace" ? payload.items : [...current, ...payload.items]));
        setCursor(payload.nextCursor);
        setHasMore(payload.hasMore);
      } catch (error) {
        const message = error instanceof Error ? error.message : "No fue posible cargar impresiones";
        onError(message);
        onToast(message, "error");
      } finally {
        if (mode === "replace") {
          setLoading(false);
        } else {
          setLoadingMore(false);
        }
      }
    },
    [buildQuery, cursor, onError, onToast, sessionPin]
  );

  useEffect(() => {
    fetchJobs("replace").catch(() => undefined);
  }, [fetchJobs]);

  const onApplyFilters = useCallback(async () => {
    if (!fromDate || !toDate) {
      onToast("Selecciona rango de fechas valido.", "error");
      return;
    }

    if (new Date(`${fromDate}T00:00:00`).getTime() > new Date(`${toDate}T00:00:00`).getTime()) {
      onToast("La fecha inicial no puede ser mayor a la final.", "error");
      return;
    }

    setCursor(null);
    await fetchJobs("replace");
  }, [fetchJobs, fromDate, onToast, toDate]);

  const retryRow = useCallback(
    async (jobId: string) => {
      if (!sessionPin) {
        return;
      }

      setRetryingId(jobId);
      try {
        await apiFetch<{ job: { id: string } }>(`/api/print-jobs/${jobId}/retry`, {
          method: "POST",
          headers: { "x-session-pin": sessionPin }
        });
        onError(null);
        onToast("Ticket reimpreso.", "success");
        await fetchJobs("replace");
      } catch (error) {
        void error;
        const message = "No se pudo imprimir ticket.";
        onError(message);
        onToast(message, "error");
      } finally {
        setRetryingId(null);
      }
    },
    [fetchJobs, onError, onToast, sessionPin]
  );

  const retryFailed = useCallback(async () => {
    if (!sessionPin) {
      return;
    }

    setRetryingFailed(true);
    try {
      const params = buildQuery();
      params.delete("status");
      params.delete("limit");
      params.delete("cursor");

      const payload = await apiFetch<{ retriedOk: number; retriedFailed: number; failedIds: string[] }>(
        `/api/print-jobs/retry-failed?${params.toString()}`,
        {
          method: "POST",
          headers: { "x-session-pin": sessionPin }
        }
      );

      const message = `Reintento: ${payload.retriedOk} ok, ${payload.retriedFailed} fallaron.`;
      onError(payload.retriedFailed > 0 ? message : null);
      onToast(message, payload.retriedFailed > 0 ? "error" : "success");
      await fetchJobs("replace");
    } catch (error) {
      void error;
      const message = "No se pudo imprimir ticket.";
      onError(message);
      onToast(message, "error");
    } finally {
      setRetryingFailed(false);
    }
  }, [buildQuery, fetchJobs, onError, onToast, sessionPin]);

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">Historial de impresiones</h2>
          <p className="text-xs text-slate-500">Default: ultimos 7 dias. Reimprime por fila o todos los fallidos filtrados.</p>
        </div>
        <button
          onClick={() => {
            retryFailed().catch(() => undefined);
          }}
          disabled={retryingFailed || loading}
          className="rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {retryingFailed ? "Reintentando..." : "Reimprimir fallidos"}
        </button>
      </div>

      <div className="mb-4 grid gap-2 rounded-xl bg-slate-50 p-3 md:grid-cols-5">
        <label className="text-xs font-semibold text-slate-700">
          Desde
          <input
            type="date"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs font-semibold text-slate-700">
          Hasta
          <input
            type="date"
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs font-semibold text-slate-700">
          Estado
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as PrintJobStatusFilter)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="all">Todos</option>
            <option value="pending">Pendiente</option>
            <option value="printed">Impreso</option>
            <option value="failed">Fallido</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-700 md:col-span-2">
          Orden # (opcional)
          <div className="mt-1 flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={workOrderNumber}
              onChange={(event) => setWorkOrderNumber(event.target.value.replace(/[^0-9]/g, ""))}
              placeholder="Ej. 1042"
              className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
            />
            <button
              onClick={() => {
                onApplyFilters().catch(() => undefined);
              }}
              disabled={loading}
              className="rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              Aplicar
            </button>
          </div>
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Orden #</th>
              <th className="px-3 py-2">Tipo ticket</th>
              <th className="px-3 py-2">Carga</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Intentos</th>
              <th className="px-3 py-2">Ultimo error</th>
              <th className="px-3 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {items.map((row) => (
              <tr key={row.id}>
                <td className="px-3 py-2 text-xs text-slate-600">{formatDateTime(row.createdAt)}</td>
                <td className="px-3 py-2 font-semibold text-slate-800">{row.workOrderNumber}</td>
                <td className="px-3 py-2">{ticketTypeLabel(row.ticketType)}</td>
                <td className="px-3 py-2">{row.loadIndex ?? "-"}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(row.status)}`}>{statusLabel(row.status)}</span>
                </td>
                <td className="px-3 py-2">{row.attemptCount}</td>
                <td className="max-w-[280px] truncate px-3 py-2 text-xs text-slate-600" title={row.lastError ?? ""}>
                  {row.lastError ?? "-"}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setSelectedPreview(row)}
                      className="rounded-lg bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-800"
                    >
                      Ver
                    </button>
                    <button
                      onClick={() => {
                        retryRow(row.id).catch(() => undefined);
                      }}
                      disabled={retryingId === row.id}
                      className="rounded-lg bg-cyan-700 px-2.5 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {retryingId === row.id ? "Reimprimiendo..." : "Reimprimir"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-sm text-slate-500">
                  Sin tickets para estos filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {loading && <p className="mt-3 text-sm text-slate-500">Cargando impresiones...</p>}

      {!loading && hasMore && (
        <div className="mt-4">
          <button
            onClick={() => {
              fetchJobs("append").catch(() => undefined);
            }}
            disabled={loadingMore}
            className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingMore ? "Cargando..." : "Cargar mas"}
          </button>
        </div>
      )}

      {selectedPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setSelectedPreview(null)}>
          <div className="w-full max-w-2xl rounded-2xl bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{selectedPreview.ticketPreview.title}</h3>
                <p className="text-xs text-slate-600">
                  Orden #{selectedPreview.workOrderNumber} · {ticketTypeLabel(selectedPreview.ticketType)}
                </p>
              </div>
              <button onClick={() => setSelectedPreview(null)} className="rounded-lg bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-700">
                Cerrar
              </button>
            </div>
            <pre className="max-h-[60vh] overflow-auto rounded-xl bg-slate-900 p-3 text-xs text-slate-100">
              {selectedPreview.ticketPreview.text}
            </pre>
          </div>
        </div>
      )}
    </section>
  );
}
