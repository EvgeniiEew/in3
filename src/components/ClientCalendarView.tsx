"use client";

import { useEffect, useRef, useState } from "react";
import RescheduleModal from "@/components/RescheduleModal";
import { moscowDateStr, shiftMoscowDate, moscowMinutesOfDay, moscowTimeStr, moscowDateRu } from "@/lib/timezone";

type Master = { id: string; name: string };
type Appointment = {
  id: string;
  masterId: string;
  startAt: string;
  endAt: string;
  status: "PENDING" | "CONFIRMED" | "CANCELLED" | "DONE";
  mine: boolean;
  service: { id: string; name: string; durationMin: number } | null;
};
type Service = { id: string; name: string; durationMin: number; priceRub: number | null };
type Shift = { masterId: string; startMinutes: number; endMinutes: number };

// Fallback only for a day where nobody has a shift at all — otherwise the
// grid sizes itself to actual working hours (see computeDayBounds below).
const FALLBACK_START_MIN = 9 * 60;
const FALLBACK_END_MIN = 21 * 60;
const PX_PER_MIN = 1.4;

function todayStr() {
  return moscowDateStr();
}

function minutesOfDay(iso: string) {
  return moscowMinutesOfDay(iso);
}

function minutesToHHMM(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

function shiftDate(dateStr: string, days: number) {
  return shiftMoscowDate(dateStr, days);
}

function computeDayBounds(shifts: Shift[], appointments: Appointment[]) {
  let min = shifts.length ? Math.min(...shifts.map((s) => s.startMinutes)) : FALLBACK_START_MIN;
  let max = shifts.length ? Math.max(...shifts.map((s) => s.endMinutes)) : FALLBACK_END_MIN;
  for (const a of appointments) {
    const s = minutesOfDay(a.startAt);
    const e = minutesOfDay(a.endAt);
    if (s < min) min = s;
    if (e > max) max = e;
  }
  return { dayStartMin: Math.floor(min / 60) * 60, dayEndMin: Math.ceil(max / 60) * 60 };
}

export default function ClientCalendarView() {
  const [date, setDate] = useState(todayStr());
  const [masters, setMasters] = useState<Master[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [detailsModal, setDetailsModal] = useState<Appointment | null>(null);
  const [bookModal, setBookModal] = useState<{ masterId: string; masterName: string } | null>(null);
  const [rescheduling, setRescheduling] = useState<Appointment | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);

  // Guards against rapid ← / → clicks: drop a response if a newer load()
  // has since started, instead of letting a slow, stale request overwrite
  // the UI with the wrong day's data.
  const loadIdRef = useRef(0);

  async function load() {
    const myLoadId = ++loadIdRef.current;
    const res = await fetch(`/api/calendar?date=${date}`);
    if (myLoadId !== loadIdRef.current) return;
    if (res.status === 401) {
      window.location.href = "/login";
      return;
    }
    const data = await res.json();
    if (myLoadId !== loadIdRef.current) return;
    setMasters(data.masters ?? []);
    setAppointments(data.appointments ?? []);
    setShifts(data.shifts ?? []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  async function cancelAppointment(id: string) {
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
      setDetailsModal(null);
      load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Не удалось отменить запись");
    }
  }

  async function rescheduleAppointment(id: string, masterId: string, startAt: string) {
    const res = await fetch("/api/cabinet/appointments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "reschedule", masterId, startAt }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Не удалось перенести запись");
    setRescheduling(null);
    setDetailsModal(null);
    load();
  }

  const { dayStartMin, dayEndMin } = computeDayBounds(shifts, appointments);
  const hours: number[] = [];
  for (let m = dayStartMin; m <= dayEndMin; m += 60) hours.push(m);

  return (
    <div className="p-4">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button onClick={() => setDate(shiftDate(date, -1))} className="rounded border border-gray-300 px-3 py-1">
          ←
        </button>
        <input
          type="date"
          value={date}
          min={todayStr()}
          onChange={(e) => setDate(e.target.value)}
          className="rounded border border-gray-300 px-2 py-1"
        />
        <button onClick={() => setDate(shiftDate(date, 1))} className="rounded border border-gray-300 px-3 py-1">
          →
        </button>
        <span className="text-sm text-gray-500">Свободная ячейка — запись, ваша запись — отмена</span>
      </div>

      {notice && (
        <div className="mb-4 flex items-center justify-between rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="ml-3 text-red-400">
            ✕
          </button>
        </div>
      )}

      <div className="flex overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <div className="w-14 shrink-0 border-r border-gray-100">
          <div className="h-10 border-b border-gray-100" />
          {hours.map((m) => (
            <div
              key={m}
              style={{ height: 60 * PX_PER_MIN }}
              className="border-b border-gray-50 pr-1 text-right text-xs text-gray-400"
            >
              {String(Math.floor(m / 60)).padStart(2, "0")}:00
            </div>
          ))}
        </div>

        {masters.map((master) => {
          const masterShift = shifts.find((s) => s.masterId === master.id);
          return (
            <div key={master.id} className="relative w-40 shrink-0 border-r border-gray-100">
              <div className="flex h-10 flex-col items-center justify-center border-b border-gray-100 px-1 text-center">
                <span className="text-sm font-medium leading-tight">{master.name}</span>
                <span className={`text-[11px] leading-tight ${masterShift ? "text-gray-400" : "text-amber-600"}`}>
                  {masterShift ? `${minutesToHHMM(masterShift.startMinutes)}–${minutesToHHMM(masterShift.endMinutes)}` : "Выходной"}
                </span>
              </div>
              <div
                className="relative"
                style={{ height: (dayEndMin - dayStartMin) * PX_PER_MIN }}
                onClick={() => setBookModal({ masterId: master.id, masterName: master.name })}
              >
                {hours.map((m) => (
                  <div
                    key={m}
                    className="absolute w-full border-b border-gray-50"
                    style={{ top: (m - dayStartMin) * PX_PER_MIN }}
                  />
                ))}
                {!masterShift && (
                  <div
                    className="pointer-events-none absolute inset-0 bg-gray-100/70"
                    style={{ height: (dayEndMin - dayStartMin) * PX_PER_MIN }}
                  />
                )}
                {masterShift && masterShift.startMinutes > dayStartMin && (
                  <div
                    className="pointer-events-none absolute left-0 right-0 top-0 bg-gray-100/70"
                    style={{ height: (masterShift.startMinutes - dayStartMin) * PX_PER_MIN }}
                  />
                )}
                {masterShift && masterShift.endMinutes < dayEndMin && (
                  <div
                    className="pointer-events-none absolute left-0 right-0 bottom-0 bg-gray-100/70"
                    style={{ height: (dayEndMin - masterShift.endMinutes) * PX_PER_MIN }}
                  />
                )}
                {appointments
                  .filter((a) => a.masterId === master.id)
                  .map((a) => {
                    const start = minutesOfDay(a.startAt);
                    const end = minutesOfDay(a.endAt);
                    return (
                      <div
                        key={a.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (a.mine) setDetailsModal(a);
                        }}
                        className={`absolute left-1 right-1 rounded border px-2 py-1 text-xs ${
                          a.mine
                            ? "cursor-pointer border-brand-500 bg-brand-100"
                            : "cursor-default border-gray-300 bg-gray-200 text-gray-500"
                        }`}
                        style={{
                          top: (start - dayStartMin) * PX_PER_MIN,
                          height: Math.max((end - start) * PX_PER_MIN, 24),
                        }}
                      >
                        {a.mine ? a.service?.name ?? "Моя запись" : "Занято"}
                      </div>
                    );
                  })}
              </div>
            </div>
          );
        })}
      </div>

      {detailsModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/30" onClick={() => setDetailsModal(null)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 font-semibold">Ваша запись</h3>
            <p className="text-sm text-gray-600">
              {detailsModal.service?.name}
              <br />
              {moscowDateRu(detailsModal.startAt).slice(0, 5)} {moscowTimeStr(detailsModal.startAt)}
            </p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setDetailsModal(null)} className="flex-1 rounded border border-gray-300 px-3 py-2">
                Закрыть
              </button>
              {detailsModal.status !== "CANCELLED" && detailsModal.status !== "DONE" && (
                <>
                  <button
                    onClick={() => setRescheduling(detailsModal)}
                    className="flex-1 rounded border border-brand-600 px-3 py-2 text-brand-700"
                  >
                    Перенести
                  </button>
                  <button
                    onClick={() => cancelAppointment(detailsModal.id)}
                    className="flex-1 rounded bg-red-600 px-3 py-2 text-white"
                  >
                    Отменить
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {rescheduling && rescheduling.service && (
        <RescheduleModal
          serviceId={rescheduling.service.id}
          serviceName={rescheduling.service.name}
          currentMasterId={rescheduling.masterId}
          currentMasterName={masters.find((m) => m.id === rescheduling.masterId)?.name ?? ""}
          allowMasterChange
          onClose={() => setRescheduling(null)}
          onConfirm={(masterId, startAt) => rescheduleAppointment(rescheduling.id, masterId, startAt)}
        />
      )}

      {bookModal && (
        <BookModal
          masterId={bookModal.masterId}
          masterName={bookModal.masterName}
          date={date}
          onClose={() => setBookModal(null)}
          onBooked={() => {
            setBookModal(null);
            load();
          }}
          onError={(msg) => setNotice(msg)}
        />
      )}
    </div>
  );
}

function BookModal({
  masterId,
  masterName,
  date,
  onClose,
  onBooked,
  onError,
}: {
  masterId: string;
  masterName: string;
  date: string;
  onClose: () => void;
  onBooked: () => void;
  onError: (msg: string) => void;
}) {
  const [services, setServices] = useState<Service[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [slots, setSlots] = useState<{ start: string; end: string }[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [busy, setBusy] = useState(false);

  // Only services this specific master actually performs — not every
  // service in the salon.
  useEffect(() => {
    fetch(`/api/services?masterId=${masterId}`)
      .then((r) => r.json())
      .then((d) => {
        const list: Service[] = (d.categories ?? []).flatMap((c: { services: Service[] }) => c.services);
        setServices(list);
        setServiceId((prev) => prev || list[0]?.id || "");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterId]);

  useEffect(() => {
    if (!serviceId) return;
    setLoadingSlots(true);
    fetch(`/api/availability?masterId=${masterId}&serviceId=${serviceId}&date=${date}`)
      .then((r) => r.json())
      .then((d) => setSlots(d.slots ?? []))
      .finally(() => setLoadingSlots(false));
  }, [serviceId, masterId, date]);

  async function book(startAt: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ masterId, serviceId, startAt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Не удалось создать запись");
      onBooked();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-sm flex-col rounded-xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 shrink-0 font-semibold">Запись · {masterName}</h3>

        {services.length === 0 ? (
          <p className="text-sm text-gray-500">Этот мастер пока не выполняет ни одной услуги.</p>
        ) : (
          <>
            <select
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              className="w-full shrink-0 rounded border border-gray-300 px-3 py-2"
            >
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.durationMin} мин)
                </option>
              ))}
            </select>

            <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
              {loadingSlots && <p className="text-sm text-gray-500">Загружаем свободное время…</p>}
              {!loadingSlots && slots.length === 0 && <p className="text-sm text-gray-500">Нет свободных слотов.</p>}
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
          </>
        )}

        <button onClick={onClose} className="mt-4 w-full shrink-0 rounded border border-gray-300 px-3 py-2">
          Закрыть
        </button>
      </div>
    </div>
  );
}
