"use client";

import { useEffect, useState } from "react";
import RescheduleModal from "@/components/RescheduleModal";
import { moscowDateRu, moscowTimeStr } from "@/lib/timezone";

type Appointment = {
  id: string;
  startAt: string;
  status: "PENDING" | "CONFIRMED" | "CANCELLED" | "DONE";
  service: { id: string; name: string; priceRub: number | null; durationMin: number };
  master: { id: string; name: string };
};

const STATUS_LABEL: Record<Appointment["status"], string> = {
  PENDING: "Ожидает подтверждения",
  CONFIRMED: "Подтверждена",
  CANCELLED: "Отменена",
  DONE: "Завершена",
};

function fmt(iso: string) {
  return `${moscowDateRu(iso).slice(0, 5)} ${moscowTimeStr(iso)}`;
}

export default function CabinetClient() {
  // Middleware already guarantees a valid client session before this page
  // renders, so we trust it and load records straight away — no re-login.
  // If the cookie happens to expire mid-visit, the fetch below 401s and we
  // bounce to /login same as everywhere else.
  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [bonusPoints, setBonusPoints] = useState(0);
  const [rescheduling, setRescheduling] = useState<Appointment | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/cabinet/appointments");
    if (res.status === 401) {
      window.location.href = "/login";
      return;
    }
    const data = await res.json();
    setAppointments(data.appointments ?? []);
    setBonusPoints(data.bonusPoints ?? 0);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function cancel(id: string) {
    if (!confirm("Отменить запись?")) return;
    try {
      const res = await fetch("/api/cabinet/appointments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "cancel" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Не удалось отменить запись");
      }
      load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Не удалось отменить запись");
    }
  }

  async function reschedule(id: string, masterId: string, startAt: string) {
    const res = await fetch("/api/cabinet/appointments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "reschedule", masterId, startAt }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Не удалось перенести запись");
    setRescheduling(null);
    load();
  }

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Загрузка…</div>;
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <a href="/" aria-label="На главную" className="text-xl leading-none text-gray-500">
            ⌂
          </a>
          <h1 className="text-base font-semibold">Мои записи</h1>
        </div>
        <span className="rounded-full bg-brand-50 px-3 py-1 text-xs text-brand-700">
          Бонусы: {bonusPoints}
        </span>
      </header>

      <main className="flex-1 px-4 py-4">
        {notice && (
          <div className="mb-4 flex items-center justify-between rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
            <span>{notice}</span>
            <button onClick={() => setNotice(null)} className="ml-3 text-red-400">
              ✕
            </button>
          </div>
        )}
        <a
          href="/calendar"
          className="mb-4 block rounded-xl bg-brand-600 px-4 py-3 text-center font-medium text-white"
        >
          + Новая запись
        </a>
        <div className="space-y-3">
          {appointments.length === 0 && <p className="text-gray-500">Записей пока нет.</p>}
          {appointments.map((a) => (
            <div key={a.id} className="rounded-xl border border-gray-200 px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium">{a.service.name}</div>
                  <div className="text-sm text-gray-500">
                    {a.master.name} · {fmt(a.startAt)}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-xs text-gray-500">{STATUS_LABEL[a.status]}</div>
                  {a.status !== "CANCELLED" && a.status !== "DONE" && (
                    <div className="mt-1 flex flex-col items-end gap-1">
                      <button
                        onClick={() => setRescheduling(a)}
                        className="text-sm text-brand-700 active:underline"
                      >
                        Перенести
                      </button>
                      <button
                        onClick={() => cancel(a.id)}
                        className="text-sm text-red-600 active:underline"
                      >
                        Отменить
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>

      {rescheduling && (
        <RescheduleModal
          serviceId={rescheduling.service.id}
          serviceName={rescheduling.service.name}
          currentMasterId={rescheduling.master.id}
          currentMasterName={rescheduling.master.name}
          allowMasterChange
          onClose={() => setRescheduling(null)}
          onConfirm={(masterId, startAt) => reschedule(rescheduling.id, masterId, startAt)}
        />
      )}
    </div>
  );
}
