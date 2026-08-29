import Link from "next/link";

export default function MasterLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <nav className="flex items-center gap-4 border-b border-gray-200 bg-white px-4 py-3 text-sm">
        <span className="font-semibold">Кабинет мастера</span>
        <Link href="/master/calendar" className="text-gray-600 hover:text-brand-600">
          Календарь
        </Link>
        <Link href="/master/waitlist" className="text-gray-600 hover:text-brand-600">
          Очередь
        </Link>
        <form action="/api/master/logout" method="post" className="ml-auto">
          <button type="submit" className="text-gray-400 hover:text-gray-700">
            Выйти
          </button>
        </form>
      </nav>
      <div>{children}</div>
    </div>
  );
}
