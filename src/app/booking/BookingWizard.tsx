"use client";

import { useEffect, useMemo, useState } from "react";
import { moscowDateStr, moscowTimeStr, dateStrToRu } from "@/lib/timezone";

type Service = { id: string; name: string; priceRub: number | null; durationMin: number };
type Category = { id: string; name: string; services: Service[] };
type Master = { id: string; name: string; photoUrl: string | null };
type Slot = { start: string; end: string; masterId: string; masterName: string };

const STEP_TITLES = ["Услуга", "Мастер", "Время", "Контакты", "Готово"] as const;

// "Today" and every date field in this wizard follow Moscow time (the
// salon's time zone) — not the visitor's own device clock — so a booking
// made from a different time zone still lines up with the salon's actual
// calendar day. See src/lib/timezone.ts.
function todayStr() {
  return moscowDateStr();
}

function formatTime(iso: string) {
  return moscowTimeStr(iso);
}

export default function BookingWizard() {
  const [step, setStep] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [service, setService] = useState<Service | null>(null);

  const [masters, setMasters] = useState<Master[]>([]);
  const [masterChoice, setMasterChoice] = useState<string>(""); // "any" or master id

  const [date, setDate] = useState(todayStr());
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [waitlistMode, setWaitlistMode] = useState(false);
  const [waitlisted, setWaitlisted] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/services")
      .then((r) => r.json())
      .then((d) => setCategories(d.categories ?? []));
  }, []);

  useEffect(() => {
    if (!service) return;
    fetch(`/api/masters?serviceId=${service.id}`)
      .then((r) => r.json())
      .then((d) => setMasters(d.masters ?? []));
  }, [service]);

  useEffect(() => {
    if (step !== 2 || !service) return;
    setLoadingSlots(true);
    setSlot(null);
    setError(null);

    const targets = masterChoice === "any" ? masters : masters.filter((m) => m.id === masterChoice);

    Promise.all(
      targets.map((m) =>
        fetch(`/api/availability?masterId=${m.id}&serviceId=${service.id}&date=${date}`)
          .then((r) => r.json())
          .then((d) =>
            (d.slots ?? []).map((s: { start: string; end: string }) => ({
              ...s,
              masterId: m.id,
              masterName: m.name,
            }))
          )
      )
    )
      .then((results) => {
        const merged = results.flat().sort((a, b) => a.start.localeCompare(b.start));
        setSlots(merged);
      })
      .finally(() => setLoadingSlots(false));
  }, [step, date, masterChoice, masters, service]);

  const selectedCategoryServices = useMemo(() => categories, [categories]);

  function goBack() {
    setError(null);
    setStep((s) => Math.max(0, s - 1));
  }

  async function identify() {
    const idRes = await fetch("/api/auth/identify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, name }),
    });
    const idData = await idRes.json();
    if (!idRes.ok) {
      // The server refuses to silently swap an already-logged-in session
      // to a different phone number — ask the person here, and only retry
      // with explicit confirmation if they say yes.
      if (idData.switchRequired) {
        if (!confirm(idData.error || "Продолжить с этим номером и выйти из текущего аккаунта?")) {
          throw new Error("Отменено");
        }
        const retryRes = await fetch("/api/auth/identify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, name, confirmSwitch: true }),
        });
        const retryData = await retryRes.json();
        if (!retryRes.ok) throw new Error(retryData.error || "Не удалось сохранить контакты");
        return;
      }
      throw new Error(idData.error || "Не удалось сохранить контакты");
    }
  }

  async function confirmBooking() {
    if (!slot || !service) return;
    setError(null);
    setBusy(true);
    try {
      await identify();

      const bookRes = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ masterId: slot.masterId, serviceId: service.id, startAt: slot.start }),
      });
      const bookData = await bookRes.json();
      if (!bookRes.ok) throw new Error(bookData.error || "Не удалось создать запись");

      setStep(4);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function confirmWaitlist() {
    if (!service) return;
    setError(null);
    setBusy(true);
    try {
      await identify();

      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: service.id,
          masterId: masterChoice === "any" ? undefined : masterChoice,
          date,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Не удалось встать в очередь");

      setWaitlisted(true);
      setStep(4);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-white">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-gray-100 bg-white px-4 py-3">
        {step > 0 && step < 4 ? (
          <button onClick={goBack} aria-label="Назад" className="text-xl leading-none text-gray-500">
            ‹
          </button>
        ) : (
          <span className="w-4" />
        )}
        <h1 className="flex-1 text-center text-base font-semibold">{STEP_TITLES[step]}</h1>
        <span className="w-4 text-right text-xs text-gray-400">
          {step < 4 ? `${step + 1}/4` : ""}
        </span>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-4 pb-28">
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
        )}

        {step === 0 && (
          <div className="space-y-6">
            {selectedCategoryServices.map((cat) => (
              <div key={cat.id}>
                <h3 className="mb-2 text-sm font-medium text-gray-500">{cat.name}</h3>
                <div className="grid gap-2">
                  {cat.services.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        setService(s);
                        setStep(1);
                      }}
                      className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-4 text-left active:bg-gray-50"
                    >
                      <span className="font-medium">{s.name}</span>
                      <span className="text-sm text-gray-500">
                        {s.durationMin} мин{s.priceRub != null ? ` · ${s.priceRub} ₽` : ""}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {step === 1 && service && (
          <div className="space-y-2">
            <button
              onClick={() => {
                setMasterChoice("any");
                setStep(2);
              }}
              className="w-full rounded-xl border border-gray-200 px-4 py-4 text-left active:bg-gray-50"
            >
              Любой свободный мастер
            </button>
            {masters.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setMasterChoice(m.id);
                  setStep(2);
                }}
                className="w-full rounded-xl border border-gray-200 px-4 py-4 text-left active:bg-gray-50"
              >
                {m.name}
              </button>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <input
              type="date"
              value={date}
              min={todayStr()}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-3 py-3"
            />
            {loadingSlots && <p className="text-sm text-gray-500">Загружаем свободное время…</p>}
            {!loadingSlots && slots.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-gray-500">
                  На эту дату нет свободных слотов, попробуйте другой день — или встаньте в очередь, и мы
                  запишем вас, как только освободится время.
                </p>
                <button
                  onClick={() => {
                    setWaitlistMode(true);
                    setSlot(null);
                    setStep(3);
                  }}
                  className="w-full rounded-xl border border-brand-600 px-4 py-4 text-center font-medium text-brand-600 active:bg-brand-50"
                >
                  Встать в очередь на {dateStrToRu(date)}
                </button>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              {slots.map((s) => (
                <button
                  key={`${s.masterId}-${s.start}`}
                  onClick={() => {
                    setWaitlistMode(false);
                    setSlot(s);
                    setStep(3);
                  }}
                  className="rounded-xl border border-gray-200 px-2 py-3 text-sm active:bg-gray-50"
                  title={masterChoice === "any" ? s.masterName : undefined}
                >
                  {formatTime(s.start)}
                  {masterChoice === "any" && (
                    <div className="text-[10px] text-gray-400">{s.masterName}</div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 3 && service && (slot || waitlistMode) && (
          <div className="space-y-3">
            <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
              {waitlistMode ? (
                <>
                  Очередь · {service.name} · {masterChoice === "any" ? "любой мастер" : masters.find((m) => m.id === masterChoice)?.name}
                  <br />
                  {dateStrToRu(date)}
                </>
              ) : (
                <>
                  {service.name} · {slot!.masterName}
                  <br />
                  {dateStrToRu(date)} в {formatTime(slot!.start)}
                </>
              )}
            </div>
            <input
              placeholder="Имя"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3"
            />
            <input
              placeholder="Телефон, например +375291234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              className="w-full rounded-xl border border-gray-300 px-4 py-3"
            />
          </div>
        )}

        {step === 4 && service && (slot || waitlisted) && (
          <div className="space-y-3 pt-8 text-center">
            <div className="text-4xl">✓</div>
            {waitlisted ? (
              <>
                <h2 className="text-lg font-semibold text-brand-700">Вы в очереди!</h2>
                <p className="text-gray-600">
                  {service.name}
                  <br />
                  Мы свяжемся с вами по телефону, как только освободится время{" "}
                  {dateStrToRu(date)}.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold text-brand-700">Вы записаны!</h2>
                <p className="text-gray-600">
                  {service.name} · {slot!.masterName}
                  <br />
                  {dateStrToRu(date)} в {formatTime(slot!.start)}
                </p>
              </>
            )}
            <a
              href="/cabinet"
              className="mt-4 inline-block rounded-xl bg-brand-600 px-6 py-3 font-medium text-white"
            >
              Мои записи
            </a>
          </div>
        )}
      </main>

      {step === 3 && (
        <div className="sticky bottom-0 border-t border-gray-100 bg-white px-4 py-3">
          <button
            disabled={busy || !name || phone.length < 6}
            onClick={waitlistMode ? confirmWaitlist : confirmBooking}
            className="w-full rounded-xl bg-brand-600 px-4 py-4 font-medium text-white disabled:opacity-50"
          >
            {busy ? "Отправляем…" : waitlistMode ? "Встать в очередь" : "Записаться"}
          </button>
        </div>
      )}
    </div>
  );
}
