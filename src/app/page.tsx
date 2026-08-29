import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-2xl font-bold">Парикмахерская</h1>
      <p className="text-gray-600">
        Зарегистрируйтесь, чтобы записаться к мастеру.
      </p>
      <div className="flex w-full flex-col gap-3">
        <Link
          href="/register"
          className="rounded-xl bg-brand-600 px-6 py-4 font-medium text-white active:bg-brand-700"
        >
          Регистрация
        </Link>
        <Link
          href="/login"
          className="rounded-xl border border-gray-300 px-6 py-4 font-medium text-gray-700 active:bg-gray-50"
        >
          Вход
        </Link>
      </div>
    </main>
  );
}
