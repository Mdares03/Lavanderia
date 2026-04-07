"use client";

import { useState } from "react";

import { apiFetch } from "@/components/pos/api";
import type { Employee } from "@/components/pos/types";

type ChangePinModalProps = {
  employee: Employee;
  onClose: () => void;
  onSuccess: (newPin: string) => void;
  onError: (message: string) => void;
};

function sanitizePin(value: string) {
  return value.replace(/\D/g, "").slice(0, 4);
}

export function ChangePinModal({ employee, onClose, onSuccess, onError }: ChangePinModalProps) {
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [saving, setSaving] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5">
        <h3 className="text-xl font-bold text-slate-900">Cambiar PIN</h3>
        <p className="text-sm text-slate-600">{employee.name}</p>
        <div className="mt-4 grid gap-3">
          <input
            type="password"
            autoComplete="new-password"
            inputMode="numeric"
            maxLength={4}
            value={currentPin}
            onChange={(event) => setCurrentPin(sanitizePin(event.target.value))}
            className="rounded-xl border border-slate-300 px-4 py-3"
            placeholder="PIN actual"
          />
          <input
            type="password"
            autoComplete="new-password"
            inputMode="numeric"
            maxLength={4}
            value={newPin}
            onChange={(event) => setNewPin(sanitizePin(event.target.value))}
            className="rounded-xl border border-slate-300 px-4 py-3"
            placeholder="PIN nuevo"
          />
          <input
            type="password"
            autoComplete="new-password"
            inputMode="numeric"
            maxLength={4}
            value={confirmPin}
            onChange={(event) => setConfirmPin(sanitizePin(event.target.value))}
            className="rounded-xl border border-slate-300 px-4 py-3"
            placeholder="Confirmar PIN nuevo"
          />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button onClick={onClose} className="rounded-xl bg-slate-200 px-4 py-3 font-semibold text-slate-700">
            Cancelar
          </button>
          <button
            disabled={saving}
            onClick={async () => {
              if (currentPin.length !== 4 || newPin.length !== 4 || confirmPin.length !== 4) {
                onError("PIN debe tener 4 digitos");
                return;
              }
              if (newPin !== confirmPin) {
                onError("PIN nuevo y confirmacion no coinciden");
                return;
              }

              setSaving(true);
              try {
                await apiFetch("/api/auth/change-pin", {
                  method: "POST",
                  body: JSON.stringify({
                    employeeId: employee.id,
                    currentPin,
                    newPin
                  })
                });
                onSuccess(newPin);
              } catch (error) {
                onError(error instanceof Error ? error.message : "No fue posible cambiar PIN");
              } finally {
                setSaving(false);
              }
            }}
            className="rounded-xl bg-teal-700 px-4 py-3 font-semibold text-white disabled:opacity-60"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
