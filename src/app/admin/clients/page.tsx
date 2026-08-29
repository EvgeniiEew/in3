"use client";

import { useEffect, useState } from "react";
import { moscowDateRu } from "@/lib/timezone";

type Client = {
  id: string;
  phone: string;
  name: string | null;
  bonusPoints: number;
  createdAt: string;
  _count: { appointments: number };
};

function fmtDate(iso: string) {
  return moscowDateRu(iso);
}

export default function AdminClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [bonusDraft, setBonusDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/clients");
    if (res.status === 401) {
      window.location.href = "/login";
      return;
    }
    const data = await res.json();
    setClients(data.clients ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  function startEdit(c: Client) {
    setEditingId(c.id);
    setBonusDraft(String(c.bonusPoints));
    setError(null);
  }

  async function saveBonus(id: string) {
    const value = Number(bonusDraft);
    if (!Number.isFinite(value)) {
      setError("Бонусы должны быть числом");
      return;
    }
    if (value < 0 || value > 1_000_000) {
      setError("Бонусы должны быть от 0 до 1 000 000");
      return;
    }
    const res = await fetch("/api/admin/clients", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, bonusPoints: Math.trunc(value) }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось сохранить");
      return;
    }
    setEditingId(null);
    load();
  }

  async function removeClient(c: Client) {
    if (
      !confirm(
        `Удалить клиента ${c.name || c.phone}? Вместе с ним удалятся все его записи и очередь ожидания. Это необратимо.`
      )
    )
      return;
    const res = await fetch(`/api/admin/clients?id=${c.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось удалить клиента");
      return;
    }
    load();
  }

  const filtered = clients.filter((c) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return c.phone.toLowerCase().includes(q) || (c.name ?? "").toLowerCase().includes(q);
  });

  return (
    <div className="mx-auto max-w-2xl p-4">
      <h1 className="mb-1 text-xl font-semibold">Клиенты</h1>
      <p className="mb-4 text-sm text-gray-500">Все, кто когда-либо записывался или входил в личный кабинет.</p>

      <input
        placeholder="Поиск по имени или телефону"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-4 w-full rounded border border-gray-300 px-3 py-2"
      />

      {error && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="space-y-2">
        {filtered.length === 0 && <p className="text-gray-500">Никого не найдено.</p>}
        {filtered.map((c) => (
          <div key={c.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3">
            <div>
              <div className="font-medium">{c.name || "Без имени"}</div>
              <div className="text-sm text-gray-500">
                {c.phone} · с {fmtDate(c.createdAt)} · записей: {c._count.appointments}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              {editingId === c.id ? (
                <>
                  <input
                    value={bonusDraft}
                    onChange={(e) => setBonusDraft(e.target.value)}
                    className="w-20 rounded border border-gray-300 px-2 py-1 text-right"
                  />
                  <button onClick={() => saveBonus(c.id)} className="text-sm text-brand-600 hover:underline">
                    Сохранить
                  </button>
                  <button onClick={() => setEditingId(null)} className="text-sm text-gray-400">
                    Отмена
                  </button>
                </>
              ) : (
                <>
                  <span className="rounded-full bg-brand-50 px-3 py-1 text-sm text-brand-700">
                    Бонусы: {c.bonusPoints}
                  </span>
                  <button onClick={() => startEdit(c)} className="text-sm text-brand-600 hover:underline">
                    Изменить
                  </button>
                </>
              )}
              <button onClick={() => removeClient(c)} className="text-sm text-red-600 hover:underline">
                Удалить
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
