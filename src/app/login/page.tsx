"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Не удалось войти");
      router.push(data.redirect || "/");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6">
      <h1 className="mb-6 text-xl font-semibold">Вход</h1>
      {error && <p className="mb-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
      <div className="space-y-3">
        <input
          placeholder="Номер телефона"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          inputMode="tel"
          className="w-full rounded-xl border border-gray-300 px-4 py-3"
        />
        <input
          placeholder="Пароль"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-gray-300 px-4 py-3"
        />
        <button
          disabled={busy || !identifier || !password}
          onClick={submit}
          className="w-full rounded-xl bg-brand-600 px-4 py-4 font-medium text-white disabled:opacity-50"
        >
          {busy ? "Входим…" : "Войти"}
        </button>
        <p className="text-center text-sm text-gray-500">
          Нет аккаунта?{" "}
          <Link href="/register" className="text-brand-600 underline">
            Зарегистрироваться
          </Link>
        </p>
      </div>
    </div>
  );
}
