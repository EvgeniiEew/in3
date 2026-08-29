import Link from "next/link";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <nav className="flex items-center gap-4 border-b border-gray-200 bg-white px-4 py-3 text-sm">
        <span className="font-semibold">Админ-панель</span>
        <Link href="/admin/calendar" className="text-gray-600 hover:text-brand-600">
          Календарь
        </Link>
        <Link href="/admin/waitlist" className="text-gray-600 hover:text-brand-600">
          Очередь
        </Link>
        <Link href="/admin/services" className="text-gray-600 hover:text-brand-600">
          Услуги
        </Link>
        <Link href="/admin/masters" className="text-gray-600 hover:text-brand-600">
          Мастера
        </Link>
        <Link href="/admin/clients" className="text-gray-600 hover:text-brand-600">
          Клиенты
        </Link>
        <form action="/api/admin/logout" method="post" className="ml-auto">
          <button type="submit" className="text-gray-400 hover:text-gray-700">
            Выйти
          </button>
        </form>
      </nav>
      <div>{children}</div>
    </div>
  );
}
