import Link from "next/link";

export default function ClientCalendarLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <nav className="flex items-center gap-4 border-b border-gray-200 bg-white px-4 py-3 text-sm">
        <Link href="/" aria-label="На главную" className="text-xl leading-none text-gray-500">
          ⌂
        </Link>
        <span className="font-semibold">Календарь</span>
        <Link href="/cabinet" className="text-gray-600 hover:text-brand-600">
          Список
        </Link>
        <form action="/api/auth/client-logout-redirect" method="post" className="ml-auto">
          <button type="submit" className="text-gray-400 hover:text-gray-700">
            Выйти
          </button>
        </form>
      </nav>
      <div>{children}</div>
    </div>
  );
}
