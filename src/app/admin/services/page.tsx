"use client";

import { useEffect, useState } from "react";

type Service = {
  id: string;
  name: string;
  priceRub: number | null;
  durationMin: number;
  active: boolean;
  masterIds: string[];
};
type Category = { id: string; name: string; services: Service[] };
type Master = { id: string; name: string };

export default function AdminServicesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [masters, setMasters] = useState<Master[]>([]);
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [price, setPrice] = useState("");
  const [duration, setDuration] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<Service | null>(null);

  const [newCategoryName, setNewCategoryName] = useState("");
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/services");
    if (res.status === 401) {
      window.location.href = "/login";
      return;
    }
    const data = await res.json();
    setCategories(data.categories ?? []);
    setMasters(data.masters ?? []);
    if (!categoryId && data.categories?.[0]) setCategoryId(data.categories[0].id);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createService() {
    setError(null);
    const res = await fetch("/api/admin/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        categoryId,
        ...(price ? { priceRub: Number(price) } : {}),
        durationMin: Number(duration),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Ошибка");
      return;
    }
    setName("");
    setPrice("");
    setDuration("");
    load();
  }

  async function toggleActive(s: Service) {
    const res = await fetch("/api/admin/services", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: s.id, active: !s.active }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось изменить услугу");
      return;
    }
    load();
  }

  async function createCategory() {
    setCategoryError(null);
    const res = await fetch("/api/admin/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newCategoryName }),
    });
    const data = await res.json();
    if (!res.ok) {
      setCategoryError(data.error || "Ошибка");
      return;
    }
    setNewCategoryName("");
    setShowAddCategory(false);
    load();
  }

  return (
    <div className="mx-auto max-w-2xl p-4">
      <h1 className="mb-4 text-xl font-semibold">Услуги</h1>

      <div className="mb-6 rounded-lg border border-gray-200 p-4">
        <h2 className="mb-3 font-medium">Добавить услугу</h2>
        {error && <p className="mb-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="grid grid-cols-2 gap-2">
          <input
            placeholder="Название"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="col-span-2 rounded border border-gray-300 px-3 py-2"
          />
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="col-span-2 rounded border border-gray-300 px-3 py-2"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            placeholder="Цена, ₽ (необязательно)"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="rounded border border-gray-300 px-3 py-2"
          />
          <input
            placeholder="Длительность, мин"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="rounded border border-gray-300 px-3 py-2"
          />
        </div>
        <button
          onClick={createService}
          disabled={!name || !categoryId || !duration}
          className="mt-3 rounded bg-brand-600 px-4 py-2 text-white disabled:opacity-50"
        >
          Добавить
        </button>
      </div>

      <div className="mb-6 rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Категории</h2>
          <button onClick={() => setShowAddCategory((v) => !v)} className="text-sm text-brand-600 hover:underline">
            {showAddCategory ? "Отмена" : "+ Категория"}
          </button>
        </div>
        {showAddCategory && (
          <div className="mt-3">
            {categoryError && (
              <p className="mb-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{categoryError}</p>
            )}
            <div className="flex gap-2">
              <input
                placeholder="Название категории"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                className="flex-1 rounded border border-gray-300 px-3 py-2"
              />
              <button
                onClick={createCategory}
                disabled={!newCategoryName.trim()}
                className="rounded bg-brand-600 px-4 py-2 text-white disabled:opacity-50"
              >
                Создать
              </button>
            </div>
          </div>
        )}
      </div>

      {categories.map((cat) => (
        <div key={cat.id} className="mb-4">
          <h3 className="mb-2 font-medium text-gray-700">{cat.name}</h3>
          <div className="space-y-2">
            {cat.services.map((s) => (
              <div key={s.id} className="rounded-lg border border-gray-200 px-4 py-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className={s.active ? "" : "text-gray-400 line-through"}>{s.name}</span>
                    <span className="ml-2 text-sm text-gray-500">
                      {s.durationMin} мин{s.priceRub != null ? ` · ${s.priceRub} ₽` : ""}
                    </span>
                  </div>
                  <div className="flex shrink-0 gap-3">
                    <button
                      onClick={() => setEditing(editing?.id === s.id ? null : s)}
                      className="text-sm text-brand-600 hover:underline"
                    >
                      {editing?.id === s.id ? "Закрыть" : "Изменить"}
                    </button>
                    <button onClick={() => toggleActive(s)} className="text-sm text-brand-600 hover:underline">
                      {s.active ? "Скрыть" : "Показать"}
                    </button>
                  </div>
                </div>
                {editing?.id === s.id && (
                  <EditServiceForm
                    service={s}
                    masters={masters}
                    onClose={() => setEditing(null)}
                    onSaved={() => {
                      setEditing(null);
                      load();
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function EditServiceForm({
  service,
  masters,
  onClose,
  onSaved,
}: {
  service: Service;
  masters: Master[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(service.name);
  const [price, setPrice] = useState(service.priceRub != null ? String(service.priceRub) : "");
  const [duration, setDuration] = useState(String(service.durationMin));
  const [masterIds, setMasterIds] = useState<string[]>(service.masterIds);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggleMaster(id: string) {
    setMasterIds((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/services", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: service.id,
          name,
          ...(price ? { priceRub: Number(price) } : {}),
          durationMin: Number(duration),
          masterIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Не удалось сохранить изменения");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded border border-gray-100 bg-gray-50 p-3">
      {error && <p className="mb-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <input
          placeholder="Название"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="col-span-2 rounded border border-gray-300 px-3 py-2"
        />
        <input
          placeholder="Цена, ₽ (необязательно)"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
        />
        <input
          placeholder="Длительность, мин"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
        />
      </div>

      <p className="mb-1 mt-3 text-sm font-medium text-gray-600">Мастера, выполняющие услугу</p>
      <div className="flex flex-wrap gap-2">
        {masters.length === 0 && <p className="text-sm text-gray-400">Нет активных мастеров.</p>}
        {masters.map((m) => (
          <label
            key={m.id}
            className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${
              masterIds.includes(m.id) ? "border-brand-500 bg-brand-100 text-brand-700" : "border-gray-300 text-gray-600"
            }`}
          >
            <input
              type="checkbox"
              checked={masterIds.includes(m.id)}
              onChange={() => toggleMaster(m.id)}
              className="hidden"
            />
            {m.name}
          </label>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <button onClick={onClose} className="rounded border border-gray-300 px-4 py-2 text-sm">
          Отмена
        </button>
        <button
          onClick={save}
          disabled={busy || !name || !duration}
          className="rounded bg-brand-600 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {busy ? "Сохраняем…" : "Сохранить"}
        </button>
      </div>
    </div>
  );
}
