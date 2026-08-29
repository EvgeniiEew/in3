"use client";

import { useEffect, useState } from "react";
import { moscowDateStr, moscowTimeStr } from "@/lib/timezone";

type Master = { id: string; name: string };
type Slot = { start: string; end: string };

function todayStr() {
  return moscowDateStr();
}

// Shared reschedule (перенос) modal, reused by the client cabinet, the
// client calendar, and the staff (admin/master) calendar. The caller decides
// whether a master picker is shown (`allowMasterChange`) and what happens on
// confirm (`onConfirm` does the actual PATCH against the right endpoint).
export default function RescheduleModal({
  serviceId,
  serviceName,
  currentMasterId,
  currentMasterName,
  allowMasterChange,
  onClose,
  onConfirm,
}: {
  serviceId: string;
  serviceName: string;
  currentMasterId: string;
  currentMasterName: string;
  allowMasterChange: boolean;
  onClose: () => void;
  onConfirm: (masterId: string, startAt: string) => Promise<void>;
}) {
  const [masterId, setMasterId] = useState(currentMasterId);
  const [masters, setMasters] = useState<Master[]>([{ id: currentMasterId, name: currentMasterName }]);
  const [date, setDate] = useState(todayStr());
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!allowMasterChange) return;
    fetch(`/api/masters?serviceId=${serviceId}`)
      .then((r) => r.json())
      .then((d: { masters?: Master[] }) =>
        setMasters(d.masters?.length ? d.masters : [{ id: currentMasterId, name: currentMasterName }])
      )
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowMasterChange, serviceId]);

  useEffect(() => {
    setLoadingSlots(true);
    setError(null);
    fetch(`/api/availability?masterId=${masterId}&serviceId=${serviceId}&date=${date}`)
      .then((r) => r.json())
      .then((d) => setSlots(d.slots ?? []))
      .finally(() => setLoadingSlots(false));
  }, [masterId, serviceId, date]);

  async function pick(startAt: string) {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(masterId, startAt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-sm flex-col rounded-xl bg-white p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3 shrink-0 font-semibold">Перенести запись · {serviceName}</h3>
        {error && <p className="mb-2 shrink-0 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {allowMasterChange ? (
          <select
            value={masterId}
            onChange={(e) => setMasterId(e.target.value)}
            className="mb-2 w-full shrink-0 rounded border border-gray-300 px-3 py-2"
          >
            {masters.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        ) : (
          <p className="mb-2 shrink-0 text-sm text-gray-500">Мастер: {currentMasterName}</p>
        )}

        <input
          type="date"
          value={date}
          min={todayStr()}
          onChange={(e) => setDate(e.target.value)}
          className="mb-3 w-full shrink-0 rounded border border-gray-300 px-3 py-2"
        />

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loadingSlots && <p className="text-sm text-gray-500">Загружаем свободное время…</p>}
          {!loadingSlots && slots.length === 0 && (
            <p className="text-sm text-gray-500">Нет свободных слотов на эту дату.</p>
          )}
          <div className="grid grid-cols-4 gap-2">
            {slots.map((s) => (
              <button
                key={s.start}
                disabled={busy}
                onClick={() => pick(s.start)}
                className="rounded border border-gray-200 px-2 py-2 text-sm hover:border-brand-500 disabled:opacity-50"
              >
                {moscowTimeStr(s.start)}
              </button>
            ))}
          </div>
        </div>

        <button onClick={onClose} className="mt-4 w-full shrink-0 rounded border border-gray-300 px-3 py-2">
          Отмена
        </button>
      </div>
    </div>
  );
}
