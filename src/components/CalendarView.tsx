"use client";

import { useEffect, useRef, useState } from "react";
import RescheduleModal from "@/components/RescheduleModal";
import {
  moscowDateStr,
  shiftMoscowDate,
  moscowMinutesOfDay,
  moscowTimeStr,
  moscowDateRu,
  moscowDateTimeToISO,
} from "@/lib/timezone";

type Master = { id: string; name: string };
type Appointment = {
  id: string;
  masterId: string;
  startAt: string;
  endAt: string;
  status: "PENDING" | "CONFIRMED" | "CANCELLED" | "DONE";
  service: { id: string; name: string };
  client: { name: string | null; phone: string };
  notes: string | null;
};
type Service = { id: string; name: string; durationMin: number; priceRub: number | null };
type Role = "admin" | "master";
type Shift = { masterId: string; startMinutes: number; endMinutes: number };

// Used only as a fallback when nobody has a shift on the selected day at
// all (e.g. every master is off) — otherwise the grid sizes itself to
// actual working hours, see computeDayBounds() below.
const FALLBACK_START_MIN = 9 * 60; // 09:00
const FALLBACK_END_MIN = 21 * 60; // 21:00
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

// Grid bounds follow real working hours instead of a hardcoded 09:00–21:00:
// widest shift start/end across all masters that day, rounded out to the
// hour, and widened further if an existing appointment somehow falls
// outside that (e.g. it was booked before the shift was narrowed).
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

const STATUS_COLOR: Record<Appointment["status"], string> = {
  PENDING: "bg-amber-200 border-amber-400",
  CONFIRMED: "bg-emerald-200 border-emerald-500",
  CANCELLED: "bg-gray-200 border-gray-400 line-through opacity-60",
  DONE: "bg-blue-100 border-blue-400",
};

export default function CalendarView({ loginRedirect = "/login" }: { loginRedirect?: string }) {
  const [date, setDate] = useState(todayStr());
  const [masters, setMasters] = useState<Master[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [role, setRole] = useState<Role | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [modal, setModal] = useState<{ masterId: string; startMinutes: number } | null>(null);
  const [detailsModal, setDetailsModal] = useState<Appointment | null>(null);
  const [rescheduling, setRescheduling] = useState<Appointment | null>(null);

  // Guards against rapid ← / → clicks: if a newer load() has started since
  // this one was kicked off, its response is stale and gets dropped instead
  // of overwriting the UI with the wrong day's data.
  const loadIdRef = useRef(0);

  async function load() {
    const myLoadId = ++loadIdRef.current;
    const res = await fetch(`/api/admin/appointments?date=${date}`);
    if (myLoadId !== loadIdRef.current) return;
    if (res.status === 401) {
      window.location.href = loginRedirect;
      return;
    }
    const data = await res.json();
    if (myLoadId !== loadIdRef.current) return;
    setMasters(data.masters ?? []);
    setAppointments(data.appointments ?? []);
    setShifts(data.shifts ?? []);
    setRole(data.role ?? null);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  function canDelete(a: Appointment) {
    if (role === "admin") return true;
    return new Date(a.startAt).getTime() >= Date.now();
  }

  async function deleteAppointment(a: Appointment) {
    if (!canDelete(a)) {
      setNotice("Мастер может удалять только записи, которые ещё не прошли.");
      return;
    }
    if (!confirm("Удалить запись? Это действие нельзя отменить.")) return;
    const res = await fetch(`/api/admin/appointments?id=${a.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setNotice(data.error || "Не удалось удалить запись");
      return;
    }
    setDetailsModal(null);
    load();
  }

  async function rescheduleAppointment(id: string, masterId: string, startAt: string) {
    const res = await fetch("/api/admin/appointments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, masterId, startAt }),
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
        <button
          onClick={() => setDate(shiftDate(date, -1))}
          className="rounded border border-gray-300 px-3 py-1"
        >
          ←
        </button>
        <MiniDatePicker date={date} onChange={setDate} />
        <button
          onClick={() => setDate(shiftDate(date, 1))}
          className="rounded border border-gray-300 px-3 py-1"
        >
          →
        </button>
        <span className="text-sm text-gray-500">Кликните по свободной ячейке, чтобы создать запись</span>
        {role === "master" && (
          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-700">
            Режим мастера: удаление доступно только для будущих записей
          </span>
        )}
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
          <div className="h-12 border-b border-gray-100" />
          {hours.map((m) => (
            <div key={m} style={{ height: 60 * PX_PER_MIN }} className="border-b border-gray-50 text-right pr-1 text-xs text-gray-400">
              {String(Math.floor(m / 60)).padStart(2, "0")}:00
            </div>
          ))}
        </div>

        {masters.map((master) => {
          const masterShift = shifts.find((s) => s.masterId === master.id);
          return (
          <div key={master.id} className="relative w-56 shrink-0 border-r border-gray-100">
            <div className="flex h-12 flex-col items-center justify-center border-b border-gray-100">
              <span className="font-medium">{master.name}</span>
              <span className={`text-[10px] ${masterShift ? "text-gray-400" : "text-amber-600"}`}>
                {masterShift ? `${minutesToHHMM(masterShift.startMinutes)}–${minutesToHHMM(masterShift.endMinutes)}` : "Выходной"}
              </span>
            </div>
            <div
              className="relative"
              style={{ height: (dayEndMin - dayStartMin) * PX_PER_MIN }}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const y = e.clientY - rect.top;
                const clickedMinutes = dayStartMin + Math.round(y / PX_PER_MIN / 5) * 5;
                setModal({ masterId: master.id, startMinutes: clickedMinutes });
              }}
            >
              {!masterShift && (
                <div className="pointer-events-none absolute inset-0 bg-gray-100/70" />
              )}
              {masterShift && masterShift.startMinutes > dayStartMin && (
                <div
                  className="pointer-events-none absolute inset-x-0 top-0 bg-gray-100/70"
                  style={{ height: (masterShift.startMinutes - dayStartMin) * PX_PER_MIN }}
                />
              )}
              {masterShift && masterShift.endMinutes < dayEndMin && (
                <div
                  className="pointer-events-none absolute inset-x-0 bottom-0 bg-gray-100/70"
                  style={{ height: (dayEndMin - masterShift.endMinutes) * PX_PER_MIN }}
                />
              )}
              {hours.map((m) => (
                <div
                  key={m}
                  className="absolute w-full border-b border-gray-50"
                  style={{ top: (m - dayStartMin) * PX_PER_MIN }}
                />
              ))}
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
                        setDetailsModal(a);
                      }}
                      className={`absolute left-1 right-1 cursor-pointer rounded border px-2 py-1 text-xs ${STATUS_COLOR[a.status]}`}
                      style={{
                        top: (start - dayStartMin) * PX_PER_MIN,
                        height: Math.max((end - start) * PX_PER_MIN, 24),
                      }}
                      title="Нажмите, чтобы посмотреть запись"
                    >
                      <div className="font-medium">{a.client.name || a.client.phone}</div>
                      <div className="truncate">{a.service.name}</div>
                    </div>
                  );
                })}
            </div>
          </div>
          );
        })}
      </div>

      {modal && (
        <NewAppointmentModal
          masterId={modal.masterId}
          masterName={masters.find((m) => m.id === modal.masterId)?.name ?? ""}
          startMinutes={modal.startMinutes}
          date={date}
          onClose={() => setModal(null)}
          onCreated={() => {
            setModal(null);
            load();
          }}
        />
      )}

      {detailsModal && (
        <AppointmentDetailsModal
          appointment={detailsModal}
          masterName={masters.find((m) => m.id === detailsModal.masterId)?.name ?? ""}
          canDelete={canDelete(detailsModal)}
          onClose={() => setDetailsModal(null)}
          onDelete={() => deleteAppointment(detailsModal)}
          onReschedule={() => setRescheduling(detailsModal)}
        />
      )}

      {rescheduling && (
        <RescheduleModal
          serviceId={rescheduling.service.id}
          serviceName={rescheduling.service.name}
          currentMasterId={rescheduling.masterId}
          currentMasterName={masters.find((m) => m.id === rescheduling.masterId)?.name ?? ""}
          allowMasterChange={role === "admin"}
          onClose={() => setRescheduling(null)}
          onConfirm={(masterId, startAt) => rescheduleAppointment(rescheduling.id, masterId, startAt)}
        />
      )}
    </div>
  );
}

function shiftDate(dateStr: string, days: number) {
  return shiftMoscowDate(dateStr, days);
}

const STATUS_LABEL: Record<Appointment["status"], string> = {
  PENDING: "Ожидает подтверждения",
  CONFIRMED: "Подтверждена",
  CANCELLED: "Отменена",
  DONE: "Завершена",
};

function AppointmentDetailsModal({
  appointment,
  masterName,
  canDelete,
  onClose,
  onDelete,
  onReschedule,
}: {
  appointment: Appointment;
  masterName: string;
  canDelete: boolean;
  onClose: () => void;
  onDelete: () => void;
  onReschedule: () => void;
}) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 font-semibold">Запись</h3>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-gray-500">Клиент</dt>
            <dd className="text-right font-medium">{appointment.client.name || "Без имени"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-gray-500">Телефон</dt>
            <dd className="text-right font-medium">{appointment.client.phone}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-gray-500">Услуга</dt>
            <dd className="text-right font-medium">{appointment.service.name}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-gray-500">Мастер</dt>
            <dd className="text-right font-medium">{masterName}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-gray-500">Дата и время</dt>
            <dd className="text-right font-medium">
              {moscowDateRu(appointment.startAt)} {moscowTimeStr(appointment.startAt)}–{moscowTimeStr(appointment.endAt)}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-gray-500">Статус</dt>
            <dd className="text-right font-medium">{STATUS_LABEL[appointment.status]}</dd>
          </div>
          {appointment.notes && (
            <div className="flex justify-between gap-3">
              <dt className="shrink-0 text-gray-500">Заметка</dt>
              <dd className="text-right font-medium">{appointment.notes}</dd>
            </div>
          )}
        </dl>

        {!canDelete && (
          <p className="mt-3 rounded bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Эта запись уже прошла — удалить её может только администратор.
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded border border-gray-300 px-3 py-2">
            Закрыть
          </button>
          <button
            onClick={onReschedule}
            disabled={!canDelete}
            className="flex-1 rounded border border-brand-600 px-3 py-2 text-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Перенести
          </button>
          <button
            onClick={onDelete}
            disabled={!canDelete}
            className="flex-1 rounded bg-red-600 px-3 py-2 text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Удалить
          </button>
        </div>
      </div>
    </div>
  );
}

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTH_NAMES = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

function MiniDatePicker({ date, onChange }: { date: string; onChange: (d: string) => void }) {
  const [open, setOpen] = useState(false);
  const [viewYear, viewMonthState] = date.split("-").map(Number);
  const [viewMonth, setViewMonth] = useState({ year: viewYear, month: viewMonthState }); // month is 1-12
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const monthStr = `${viewMonth.year}-${String(viewMonth.month).padStart(2, "0")}`;
    fetch(`/api/admin/appointments/summary?month=${monthStr}`)
      .then((r) => r.json())
      .then((d) => setCounts(d.counts ?? {}));
  }, [viewMonth]);

  function changeMonth(delta: number) {
    setViewMonth((prev) => {
      let month = prev.month + delta;
      let year = prev.year;
      if (month > 12) {
        month = 1;
        year += 1;
      } else if (month < 1) {
        month = 12;
        year -= 1;
      }
      return { year, month };
    });
  }

  const firstOfMonth = new Date(viewMonth.year, viewMonth.month - 1, 1);
  const startWeekday = (firstOfMonth.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(viewMonth.year, viewMonth.month, 0).getDate();
  const today = todayStr();

  const cells: Array<{ day: number; key: string } | null> = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    const key = `${viewMonth.year}-${String(viewMonth.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    cells.push({ day, key });
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded border border-gray-300 px-3 py-1 text-sm font-medium"
      >
        {new Date(`${date}T00:00:00`).toLocaleDateString("ru-RU", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        })}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-2 w-72 rounded-xl border border-gray-200 bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <button onClick={() => changeMonth(-1)} className="px-2 text-gray-500">
              ‹
            </button>
            <span className="text-sm font-medium">
              {MONTH_NAMES[viewMonth.month - 1]} {viewMonth.year}
            </span>
            <button onClick={() => changeMonth(1)} className="px-2 text-gray-500">
              ›
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-gray-400">
            {WEEKDAYS.map((w) => (
              <div key={w}>{w}</div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {cells.map((cell, i) => {
              if (!cell) return <div key={`empty-${i}`} />;
              const hasBookings = (counts[cell.key] ?? 0) > 0;
              const isPast = cell.key < today;
              const isSelected = cell.key === date;
              let color = "";
              if (hasBookings) {
                color = isPast ? "bg-gray-300 text-gray-600" : "bg-emerald-400 text-white";
              }
              return (
                <button
                  key={cell.key}
                  onClick={() => {
                    onChange(cell.key);
                    setOpen(false);
                  }}
                  className={`rounded py-1 text-xs ${color || "hover:bg-gray-100"} ${
                    isSelected ? "ring-2 ring-brand-600" : ""
                  }`}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center gap-3 text-[10px] text-gray-400">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-400" /> есть записи
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-gray-300" /> прошедшие с записями
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function NewAppointmentModal(props: {
  masterId: string;
  masterName: string;
  startMinutes: number;
  date: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { masterId, masterName, startMinutes, date, onClose, onCreated } = props;
  const [services, setServices] = useState<Service[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [hh, setHh] = useState(String(Math.floor(startMinutes / 60)).padStart(2, "0"));
  const [mm, setMm] = useState(String(startMinutes % 60).padStart(2, "0"));
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Only services this master actually performs — avoids accidentally
  // booking a service the clicked master doesn't do.
  useEffect(() => {
    fetch(`/api/services?masterId=${masterId}`)
      .then((r) => r.json())
      .then((d) => {
        const list: Service[] = (d.categories ?? []).flatMap((c: { services: Service[] }) => c.services);
        setServices(list);
        setServiceId((prev) => prev || list[0]?.id || "");
      });
  }, [masterId]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const startAt = moscowDateTimeToISO(date, hh, mm);
      const res = await fetch("/api/admin/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ masterId, serviceId, startAt, clientPhone: phone, clientName: name, notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Не удалось создать запись");
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 font-semibold">Новая запись · {masterName}</h3>
        {error && <p className="mb-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="space-y-2">
          <select
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2"
          >
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.durationMin} мин)
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <input
              value={hh}
              onChange={(e) => setHh(e.target.value)}
              className="w-16 rounded border border-gray-300 px-2 py-2 text-center"
            />
            <span className="py-2">:</span>
            <input
              value={mm}
              onChange={(e) => setMm(e.target.value)}
              className="w-16 rounded border border-gray-300 px-2 py-2 text-center"
            />
          </div>
          <input
            placeholder="+375291234567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            title="Формат: +375 и 9 цифр номера"
            className="w-full rounded border border-gray-300 px-3 py-2"
          />
          <input
            placeholder="Имя клиента"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2"
          />
          <input
            placeholder="Заметка (необязательно)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2"
          />
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded border border-gray-300 px-3 py-2">
            Отмена
          </button>
          <button
            disabled={busy || !phone || !serviceId}
            onClick={submit}
            className="flex-1 rounded bg-brand-600 px-3 py-2 text-white disabled:opacity-50"
          >
            {busy ? "Создаём…" : "Создать"}
          </button>
        </div>
      </div>
    </div>
  );
}
