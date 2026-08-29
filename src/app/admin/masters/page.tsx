"use client";

import { useEffect, useState } from "react";
import { isValidBelarusPhone } from "@/lib/phone";

type Shift = { dayOfWeek: number; startMinutes: number; endMinutes: number };
type Master = { id: string; name: string; phone: string | null; active: boolean; shifts: Shift[] };

const DAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

function defaultShifts(): Shift[] {
  // Mon-Sat, 10:00-19:00
  return [1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, startMinutes: 600, endMinutes: 1140 }));
}

export default function AdminMastersPage() {
  const [masters, setMasters] = useState<Master[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("+375");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editingShiftsFor, setEditingShiftsFor] = useState<Master | null>(null);

  async function load() {
    const res = await fetch("/api/admin/masters");
    if (res.status === 401) {
      window.location.href = "/login";
      return;
    }
    const data = await res.json();
    setMasters(data.masters ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function createMaster() {
    setError(null);
    const res = await fetch("/api/admin/masters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone, password, shifts: defaultShifts() }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Ошибка");
      return;
    }
    setName("");
    setPhone("+375");
    setPassword("");
    load();
  }

  async function toggleActive(m: Master) {
    const res = await fetch("/api/admin/masters", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: m.id, active: !m.active }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось изменить видимость мастера");
      return;
    }
    load();
  }

  async function removeMaster(m: Master) {
    if (!confirm(`Удалить мастера ${m.name}? Это действие нельзя отменить.`)) return;
    const res = await fetch(`/api/admin/masters?id=${m.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось удалить мастера");
      return;
    }
    load();
  }

  const phoneValid = phone === "" || isValidBelarusPhone(phone);

  return (
    <div className="mx-auto max-w-2xl p-4">
      <h1 className="mb-4 text-xl font-semibold">Мастера</h1>

      <div className="mb-6 rounded-lg border border-gray-200 p-4">
        <h2 className="mb-3 font-medium">Добавить мастера</h2>
        {error && <p className="mb-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="grid grid-cols-2 gap-2">
          <input
            placeholder="Имя мастера"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="col-span-2 rounded border border-gray-300 px-3 py-2"
          />
          <div>
            <input
              placeholder="+375291234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              title="Формат: +375 и 9 цифр номера"
              className={`w-full rounded border px-3 py-2 ${
                phoneValid ? "border-gray-300" : "border-red-400"
              }`}
            />
            {!phoneValid && (
              <p className="mt-1 text-xs text-red-600">Формат: +375 и 9 цифр номера</p>
            )}
          </div>
          <input
            placeholder="Пароль мастера"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded border border-gray-300 px-3 py-2"
          />
        </div>
        <button
          onClick={createMaster}
          disabled={!name || !phoneValid || !phone || !password}
          className="mt-3 rounded bg-brand-600 px-4 py-2 text-white disabled:opacity-50"
        >
          Добавить
        </button>
        <p className="mt-2 text-xs text-gray-400">
          Мастер сможет войти на /login по этому телефону и паролю и увидит общий календарь (как у
          админа), но сможет удалять только ещё не прошедшие записи. По умолчанию ставится график
          Пн–Сб 10:00–19:00 — поменять его можно кнопкой «График» у каждого мастера ниже.
        </p>
      </div>

      <div className="space-y-2">
        {masters.map((m) => (
          <div key={m.id} className="rounded-lg border border-gray-200 px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <span className={m.active ? "font-medium" : "font-medium text-gray-400 line-through"}>
                  {m.name}
                </span>
                <span className="ml-2 text-xs text-gray-400">{m.phone}</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setEditingShiftsFor(m)}
                  className="text-sm text-brand-600 hover:underline"
                >
                  График
                </button>
                <button onClick={() => toggleActive(m)} className="text-sm text-brand-600 hover:underline">
                  {m.active ? "Скрыть" : "Показать"}
                </button>
                <button onClick={() => removeMaster(m)} className="text-sm text-red-600 hover:underline">
                  Удалить
                </button>
              </div>
            </div>
            <div className="mt-1 text-xs text-gray-500">
              {m.shifts.length === 0 && "Выходной все дни"}
              {m.shifts
                .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
                .map(
                  (s) =>
                    `${DAYS[s.dayOfWeek]} ${String(Math.floor(s.startMinutes / 60)).padStart(2, "0")}:${String(
                      s.startMinutes % 60
                    ).padStart(2, "0")}-${String(Math.floor(s.endMinutes / 60)).padStart(2, "0")}:${String(
                      s.endMinutes % 60
                    ).padStart(2, "0")}`
                )
                .join(", ")}
            </div>
          </div>
        ))}
      </div>

      {editingShiftsFor && (
        <EditShiftsModal
          master={editingShiftsFor}
          onClose={() => setEditingShiftsFor(null)}
          onSaved={() => {
            setEditingShiftsFor(null);
            load();
          }}
        />
      )}
    </div>
  );
}

const ORDERED_DAYS = [1, 2, 3, 4, 5, 6, 0]; // Пн..Вс

function minutesToHHMM(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

function hhmmToMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function EditShiftsModal({
  master,
  onClose,
  onSaved,
}: {
  master: Master;
  onClose: () => void;
  onSaved: () => void;
}) {
  const initial = Object.fromEntries(
    ORDERED_DAYS.map((d) => {
      const s = master.shifts.find((x) => x.dayOfWeek === d);
      return [
        d,
        { on: !!s, start: minutesToHHMM(s?.startMinutes ?? 600), end: minutesToHHMM(s?.endMinutes ?? 1140) },
      ];
    })
  ) as Record<number, { on: boolean; start: string; end: string }>;

  const [days, setDays] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function update(day: number, patch: Partial<{ on: boolean; start: string; end: string }>) {
    setDays((prev) => ({ ...prev, [day]: { ...prev[day], ...patch } }));
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const shifts = ORDERED_DAYS.filter((d) => days[d].on).map((d) => ({
        dayOfWeek: d,
        startMinutes: hhmmToMinutes(days[d].start),
        endMinutes: hhmmToMinutes(days[d].end),
      }));
      const res = await fetch(`/api/admin/masters/${master.id}/shifts`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shifts }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Не удалось сохранить график");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 font-semibold">График · {master.name}</h3>
        {error && <p className="mb-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="space-y-2">
          {ORDERED_DAYS.map((d) => (
            <div key={d} className="flex items-center gap-2">
              <label className="flex w-16 items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  checked={days[d].on}
                  onChange={(e) => update(d, { on: e.target.checked })}
                />
                {DAYS[d]}
              </label>
              <input
                type="time"
                value={days[d].start}
                disabled={!days[d].on}
                onChange={(e) => update(d, { start: e.target.value })}
                className="w-24 rounded border border-gray-300 px-2 py-1 text-sm disabled:opacity-40"
              />
              <span className="text-gray-400">—</span>
              <input
                type="time"
                value={days[d].end}
                disabled={!days[d].on}
                onChange={(e) => update(d, { end: e.target.value })}
                className="w-24 rounded border border-gray-300 px-2 py-1 text-sm disabled:opacity-40"
              />
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded border border-gray-300 px-3 py-2">
            Отмена
          </button>
          <button
            onClick={save}
            disabled={busy}
            className="flex-1 rounded bg-brand-600 px-3 py-2 text-white disabled:opacity-50"
          >
            {busy ? "Сохраняем…" : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}
