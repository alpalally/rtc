import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-8">
      <h1 className="text-4xl font-bold mb-4">AgentDocs</h1>
      <p className="text-gray-400 mb-8 text-center max-w-md">
        AI-powered documentation that stays in sync with your GitHub repos.
      </p>
      <Link
        href="/repos"
        className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-semibold transition"
      >
        Get Started
      </Link>
    </main>
  );
}
