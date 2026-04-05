const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function getRepos() {
  const res = await fetch(`${API_URL}/api/repos`, { cache: 'no-store' });
  if (!res.ok) return [];
  return res.json();
}

export default async function ReposPage() {
  const repos = await getRepos();

  return (
    <main className="max-w-4xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-6">Connected Repositories</h1>
      {repos.length === 0 ? (
        <p className="text-gray-400">No repositories connected yet. Install the GitHub App to get started.</p>
      ) : (
        <ul className="space-y-3">
          {repos.map((repo: { id: string; owner: string; name: string }) => (
            <li key={repo.id} className="bg-gray-900 rounded-lg p-4 hover:bg-gray-800 transition">
              <a href={`/repos/${repo.id}`} className="font-mono hover:text-indigo-400 transition">
                {repo.owner}/{repo.name}
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
