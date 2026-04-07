"use client";

type LoginScreenProps = {
  pin: string;
  error: string | null;
  onPinChange: (value: string) => void;
  onLogin: () => Promise<void>;
};

export function LoginScreen({ pin, error, onPinChange, onLogin }: LoginScreenProps) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6">
      <h1 className="text-3xl font-bold text-teal-900">La Burbuja POS</h1>
      <p className="text-sm text-slate-600">Ingrese PIN para iniciar turno.</p>
      <input
        type="password"
        autoComplete="new-password"
        data-lpignore="true"
        inputMode="numeric"
        maxLength={4}
        value={pin}
        onChange={(event) => onPinChange(event.target.value.replace(/\D/g, "").slice(0, 4))}
        className="rounded-xl border border-slate-300 bg-white px-4 py-4 text-2xl tracking-[0.4em]"
      />
      <button onClick={onLogin} className="rounded-xl bg-teal-700 px-4 py-4 text-lg font-semibold text-white">
        Entrar
      </button>
      {error && <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700">{error}</p>}
    </main>
  );
}
