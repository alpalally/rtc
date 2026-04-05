import Link from 'next/link';
import { notFound } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function getDoc(repoId: string, docId: string) {
  const res = await fetch(`${API_URL}/api/repos/${repoId}/docs/${docId}`, { cache: 'no-store' });
  if (!res.ok) return null;
  return res.json();
}

async function getRepo(repoId: string) {
  const res = await fetch(`${API_URL}/api/repos/${repoId}`, { cache: 'no-store' });
  if (!res.ok) return null;
  return res.json();
}

export default async function DocPage({
  params,
}: {
  params: { repoId: string; docId: string };
}) {
  const [repo, doc] = await Promise.all([
    getRepo(params.repoId),
    getDoc(params.repoId, params.docId),
  ]);

  if (!doc || !repo) notFound();

  return (
    <main className="max-w-4xl mx-auto p-8">
      <nav className="text-sm text-gray-500 mb-6">
        <Link href="/repos" className="hover:text-gray-300 transition">Repositories</Link>
        <span className="mx-2">/</span>
        <Link href={`/repos/${repo.id}`} className="hover:text-gray-300 transition font-mono">
          {repo.owner}/{repo.name}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-200 font-mono">{doc.filePath}</span>
      </nav>

      <div className="mb-6">
        <h1 className="text-xl font-bold font-mono text-gray-100 mb-1">{doc.filePath}</h1>
        <p className="text-xs text-gray-500">
          Commit: <span className="font-mono">{doc.commitSha.slice(0, 7)}</span>
          {' · '}
          Updated: {new Date(doc.updatedAt).toLocaleString()}
        </p>
      </div>

      <div className="bg-gray-900 rounded-lg p-6 overflow-auto">
        <pre className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed font-sans">
          {doc.content}
        </pre>
      </div>
    </main>
  );
}
