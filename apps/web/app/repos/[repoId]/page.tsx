import Link from 'next/link';
import { notFound } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function getRepo(repoId: string) {
  const res = await fetch(`${API_URL}/api/repos/${repoId}`, { cache: 'no-store' });
  if (!res.ok) return null;
  return res.json();
}

async function getDocs(repoId: string) {
  const res = await fetch(`${API_URL}/api/repos/${repoId}/docs`, { cache: 'no-store' });
  if (!res.ok) return [];
  return res.json();
}

export default async function RepoPage({ params }: { params: { repoId: string } }) {
  const [repo, docs] = await Promise.all([
    getRepo(params.repoId),
    getDocs(params.repoId),
  ]);

  if (!repo) notFound();

  return (
    <main className="max-w-4xl mx-auto p-8">
      <nav className="text-sm text-gray-500 mb-6">
        <Link href="/repos" className="hover:text-gray-300 transition">Repositories</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-200 font-mono">{repo.owner}/{repo.name}</span>
      </nav>

      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold font-mono">{repo.owner}/{repo.name}</h1>
        <form action={`${API_URL}/api/repos/${repo.id}/sync`} method="POST">
          <button
            type="submit"
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-semibold transition"
          >
            Sync Docs
          </button>
        </form>
      </div>

      <h2 className="text-lg font-semibold mb-4 text-gray-300">
        Generated Docs
        <span className="ml-2 text-sm font-normal text-gray-500">({docs.length} files)</span>
      </h2>

      {docs.length === 0 ? (
        <div className="bg-gray-900 rounded-lg p-6 text-center text-gray-400">
          <p className="mb-2">No docs generated yet.</p>
          <p className="text-sm">Push code to this repo or click &ldquo;Sync Docs&rdquo; above to generate documentation.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {docs.map((doc: { id: string; filePath: string; updatedAt: string }) => (
            <li key={doc.id}>
              <Link
                href={`/repos/${repo.id}/docs/${doc.id}`}
                className="flex items-center justify-between bg-gray-900 hover:bg-gray-800 rounded-lg p-4 transition group"
              >
                <span className="font-mono text-sm text-gray-200 group-hover:text-indigo-400 transition">
                  {doc.filePath}
                </span>
                <span className="text-xs text-gray-500 ml-4 shrink-0">
                  {new Date(doc.updatedAt).toLocaleDateString()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
