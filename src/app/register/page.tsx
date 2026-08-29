"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("+375");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (password !== confirmPassword) {
      setError("Пароли не совпадают");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, name, password, confirmPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Не удалось зарегистрироваться");
      router.push(data.redirect || "/calendar");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6">
      <h1 className="mb-6 text-xl font-semibold">Регистрация</h1>
      {error && <p className="mb-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
      <div className="space-y-3">
        <input
          placeholder="+375291234567"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          inputMode="tel"
          className="w-full rounded-xl border border-gray-300 px-4 py-3"
        />
        <p className="-mt-2 px-1 text-xs text-gray-400">Формат: +375 и 9 цифр номера</p>
        <input
          placeholder="Имя"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-xl border border-gray-300 px-4 py-3"
        />
        <input
          placeholder="Пароль"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-gray-300 px-4 py-3"
        />
        <input
          placeholder="Подтверждение пароля"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full rounded-xl border border-gray-300 px-4 py-3"
        />
        <button
          disabled={busy || !phone || !name || !password || !confirmPassword}
          onClick={submit}
          className="w-full rounded-xl bg-brand-600 px-4 py-4 font-medium text-white disabled:opacity-50"
        >
          {busy ? "Регистрируем…" : "Зарегистрироваться"}
        </button>
        <p className="text-center text-sm text-gray-500">
          Уже есть аккаунт?{" "}
          <Link href="/login" className="text-brand-600 underline">
            Войти
          </Link>
        </p>
      </div>
    </div>
  );
}
