import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-6">
      <p className="text-xs font-bold uppercase tracking-[0.14em]">Return to sender</p>
      <h1 className="mt-2 text-5xl font-extrabold tracking-tight">This link doesn’t exist (anymore).</h1>
      <p className="mt-4 text-lg">Shared recaps can be deleted by their owner at any time.</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/make" className="btn btn-primary">Make your own</Link>
        <Link href="/sample/marathoner" className="btn btn-secondary">See a sample</Link>
      </div>
    </main>
  );
}
