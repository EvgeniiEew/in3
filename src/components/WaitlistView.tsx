"use client";

import { useEffect, useState } from "react";
import { moscowDateStr, moscowDateRu, moscowTimeStr } from "@/lib/timezone";

type Service = { id: string; name: string; durationMin: number; priceRub: number | null };
type Master = { id: string; name: string };
type WaitlistEntry = {
  id: string;
  desiredFrom: string;
  createdAt: string;
  client: { name: string | null; phone: string };
  service: { id: string; name: string; durationMin: number };
  master: { id: string; name: string } | null;
};

function todayStr() {
  return moscowDateStr();
}

export default function WaitlistView({ loginRedirect = "/login" }: { loginRedirect?: string }) {
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [bookingEntry, setBookingEntry] = useState<WaitlistEntry | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/waitlist");
    if (res.status === 401) {
      window.location.href = loginRedirect;
      return;
    }
    const data = await res.json();
    setEntries(data.entries ?? []);
  }

  useEffect(() => {
    load();
    fetch("/api/services")
      .then((r) => r.json())
      .then((d) => setServices((d.categories ?? []).flatMap((c: { services: Service[] }) => c.services)));
  }, []);

  async function removeEntry(id: string) {
    if (!confirm("Убрать клиента из очереди?")) return;
    try {
      const res = await fetch(`/api/admin/waitlist?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Не удалось убрать из очереди");
      }
      load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Не удалось убрать из очереди");
    }
  }

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Журнал записи — очередь</h1>
          <p className="text-sm text-gray-500">
            Клиенты, для которых не нашлось свободного времени. Запишите их, как только окно освободится.
          </p>
        </div>
        <button
          onClick={() => setShowAddForm((v) => !v)}
          className="rounded bg-brand-600 px-4 py-2 text-sm text-white"
        >
          + В очередь
        </button>
      </div>

      {notice && (
        <div className="mb-4 flex items-center justify-between rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="ml-3 text-red-400">
            ✕
          </button>
        </div>
      )}

      {showAddForm && (
        <AddToWaitlistForm
          services={services}
          onClose={() => setShowAddForm(false)}
          onAdded={() => {
            setShowAddForm(false);
            load();
          }}
        />
      )}

      <div className="space-y-2">
        {entries.length === 0 && <p className="text-gray-500">Очередь пуста.</p>}
        {entries.map((e, i) => (
          <div
            key={e.id}
            className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3"
          >
            <div>
              <span className="mr-2 inline-block w-5 text-center text-xs text-gray-400">{i + 1}</span>
              <span className="font-medium">{e.client.name || "Без имени"}</span>
              <span className="ml-2 text-sm text-gray-500">{e.client.phone}</span>
              <div className="ml-7 text-sm text-gray-600">
                {e.service.name} · {moscowDateRu(e.desiredFrom)} ·{" "}
                {e.master ? e.master.name : "любой мастер"}
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                onClick={() => setBookingEntry(e)}
                className="rounded bg-brand-600 px-3 py-2 text-sm text-white"
              >
                Записать
              </button>
              <button
                onClick={() => removeEntry(e.id)}
                className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-500"
              >
                Убрать
              </button>
            </div>
          </div>
        ))}
      </div>

      {bookingEntry && (
        <BookFromQueueModal
          entry={bookingEntry}
          onClose={() => setBookingEntry(null)}
          onBooked={() => {
            setBookingEntry(null);
            load();
          }}
          onError={(msg) => setNotice(msg)}
        />
      )}
    </div>
  );
}

function AddToWaitlistForm({
  services,
  onClose,
  onAdded,
}: {
  services: Service[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [date, setDate] = useState(todayStr());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!serviceId && services[0]) setServiceId(services[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientPhone: phone, clientName: name, serviceId, date }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Не удалось добавить в очередь");
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4 rounded-lg border border-gray-200 p-4">
      {error && <p className="mb-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <input
          placeholder="+375291234567"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          title="Формат: +375 и 9 цифр номера"
          className="rounded border border-gray-300 px-3 py-2"
        />
        <input
          placeholder="Имя клиента"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
        />
        <select
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
        >
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
        />
      </div>
      <div className="mt-3 flex gap-2">
        <button onClick={onClose} className="rounded border border-gray-300 px-4 py-2 text-sm">
          Отмена
        </button>
        <button
          onClick={submit}
          disabled={busy || !phone || !serviceId}
          className="rounded bg-brand-600 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {busy ? "Добавляем…" : "Добавить"}
        </button>
      </div>
    </div>
  );
}

function BookFromQueueModal({
  entry,
  onClose,
  onBooked,
  onError,
}: {
  entry: WaitlistEntry;
  onClose: () => void;
  onBooked: () => void;
  onError: (msg: string) => void;
}) {
  const [masters, setMasters] = useState<Master[]>([]);
  const [masterId, setMasterId] = useState(entry.master?.id ?? "");
  const [date, setDate] = useState(moscowDateStr(new Date(entry.desiredFrom)));
  const [slots, setSlots] = useState<{ start: string; end: string }[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/masters?serviceId=${entry.service.id}`)
      .then((r) => r.json())
      .then((d) => setMasters(d.masters ?? []));
  }, [entry.service.id]);

  useEffect(() => {
    if (!masterId) {
      setSlots([]);
      return;
    }
    setLoadingSlots(true);
    fetch(`/api/availability?masterId=${masterId}&serviceId=${entry.service.id}&date=${date}`)
      .then((r) => r.json())
      .then((d) => setSlots(d.slots ?? []))
      .finally(() => setLoadingSlots(false));
  }, [masterId, date, entry.service.id]);

  async function book(startAt: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          masterId,
          serviceId: entry.service.id,
          startAt,
          clientPhone: entry.client.phone,
          clientName: entry.client.name ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Не удалось создать запись");

      const delRes = await fetch(`/api/admin/waitlist?id=${entry.id}`, { method: "DELETE" });
      if (!delRes.ok) {
        // The appointment was created successfully — this is just a
        // cleanup step. Don't block the flow, but let the admin know the
        // entry needs to be removed from the queue manually.
        onError("Запись создана, но не удалось убрать клиента из очереди — уберите вручную.");
      }
      onBooked();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-1 font-semibold">Записать из очереди</h3>
        <p className="mb-3 text-sm text-gray-500">
          {entry.client.name || entry.client.phone} · {entry.service.name}
        </p>

        <div className="space-y-2">
          <select
            value={masterId}
            onChange={(e) => setMasterId(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2"
          >
            <option value="">Выберите мастера</option>
            {masters.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2"
          />
        </div>

        <div className="mt-3">
          {!masterId && <p className="text-sm text-gray-400">Сначала выберите мастера.</p>}
          {masterId && loadingSlots && <p className="text-sm text-gray-500">Загружаем свободное время…</p>}
          {masterId && !loadingSlots && slots.length === 0 && (
            <p className="text-sm text-gray-500">На эту дату нет свободных слотов.</p>
          )}
          <div className="grid grid-cols-4 gap-2">
            {slots.map((s) => (
              <button
                key={s.start}
                disabled={busy}
                onClick={() => book(s.start)}
                className="rounded border border-gray-200 px-2 py-2 text-sm hover:border-brand-500 disabled:opacity-50"
              >
                {moscowTimeStr(s.start)}
              </button>
            ))}
          </div>
        </div>

        <button onClick={onClose} className="mt-4 w-full rounded border border-gray-300 px-3 py-2">
          Закрыть
        </button>
      </div>
    </div>
  );
}
