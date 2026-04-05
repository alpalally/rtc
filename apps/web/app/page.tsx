import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from './api/auth/[...nextauth]/route';

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-8">
      <h1 className="text-4xl font-bold mb-4">AgentDocs</h1>
      <p className="text-gray-400 mb-8 text-center max-w-md">
        AI-powered documentation that stays in sync with your GitHub repos.
      </p>
      {session ? (
        <div className="flex flex-col items-center gap-4">
          <Link
            href="/repos"
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-semibold transition"
          >
            View Repositories
          </Link>
          <a
            href="/api/auth/signout"
            className="text-sm text-gray-500 hover:text-gray-300 transition"
          >
            Sign out ({session.user?.name})
          </a>
        </div>
      ) : (
        <a
          href="/api/auth/signin"
          className="px-6 py-3 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg font-semibold transition flex items-center gap-2"
        >
          Sign in with GitHub
        </a>
      )}
    </main>
  );
}
