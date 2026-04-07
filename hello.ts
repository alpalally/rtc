const BASE = 'https://api-production-a3e40.up.railway.app';

async function main() {
  const health = await fetch(`${BASE}/health`).then(r => r.json());
  console.log('health:', health);

  const metrics = await fetch(`${BASE}/api/admin/metrics`).then(r => r.json());
  console.log('metrics:', metrics);

  console.log('\nHello Moonshot for the World');
}

main().catch(console.error);
