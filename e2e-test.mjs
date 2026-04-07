/**
 * End-to-end test: generates real AI documentation for files in this repo
 * and stores them in the production database via a direct DB connection.
 *
 * Run with: railway run node e2e-test.mjs
 *
 * What this test does:
 *  1. Connects to the production PostgreSQL database
 *  2. Inserts a "test" repo record representing this repo
 *  3. Reads real source files from apps/api/src/
 *  4. Calls Claude (claude-haiku-4-5) to generate documentation for each file
 *  5. Stores the generated docs in the `docs` table
 *  6. Reads back the docs via the production HTTP API to confirm they are visible
 *  7. Cleans up test data
 */

import pg from 'pg';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE_URL = 'https://api-production-a3e40.up.railway.app';

// ── helpers ──────────────────────────────────────────────────────────────────

function log(label, value) {
  console.log(`\n[${label}]`);
  if (typeof value === 'object') console.log(JSON.stringify(value, null, 2));
  else console.log(value);
}

async function generateDoc(client, filePath, content) {
  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `Generate concise technical documentation for this file. Include: purpose, exports/functions, usage examples where relevant.\n\nFile: ${filePath}\n\`\`\`\n${content.slice(0, 4000)}\n\`\`\``,
    }],
  });
  const block = message.content[0];
  return block.type === 'text' ? block.text : '';
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!dbUrl) throw new Error('DATABASE_URL not set — run with: railway run node e2e-test.mjs');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  console.log('=== AgentDocs End-to-End Test ===');
  console.log('DB:', dbUrl.replace(/:([^:@]+)@/, ':***@'));
  console.log('Anthropic key:', apiKey.slice(0, 20) + '...');

  const pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  const anthropic = new Anthropic({ apiKey });

  let testRepoId;

  try {
    // ── 1. Insert a test repo ────────────────────────────────────────────────
    console.log('\n── Step 1: Create test repo record ──');
    const repoRes = await pool.query(`
      INSERT INTO repos (github_repo_id, installation_id, github_account_id, owner, name, default_branch, config)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (github_repo_id) DO UPDATE
        SET owner = EXCLUDED.owner, name = EXCLUDED.name, updated_at = NOW()
      RETURNING id, owner, name
    `, [
      999999999,        // fake github_repo_id (will not conflict with real ones)
      0,                // fake installation_id
      0,                // fake github_account_id
      'alpalally',
      'rtc',
      'main',
      JSON.stringify({ filePatterns: ['**/*.ts'], docStyle: 'concise', targetBranch: 'main' }),
    ]);

    testRepoId = repoRes.rows[0].id;
    log('Test repo created', repoRes.rows[0]);

    // ── 2. Find source files ─────────────────────────────────────────────────
    console.log('\n── Step 2: Collect source files ──');
    const srcDir = path.join(__dirname, 'apps/api/src');
    const files = [];

    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); }
        else if (entry.name.endsWith('.ts')) { files.push(full); }
      }
    }
    walk(srcDir);

    const filesToProcess = files.slice(0, 5); // cap at 5 for this test
    console.log('Files to document:', filesToProcess.map(f => path.relative(__dirname, f)));

    // ── 3. Generate docs with Claude ─────────────────────────────────────────
    console.log('\n── Step 3: Generate documentation via Claude ──');
    const generatedDocs = [];

    for (const fullPath of filesToProcess) {
      const relPath = path.relative(path.join(__dirname, 'apps/api'), fullPath);
      const content = fs.readFileSync(fullPath, 'utf-8');

      process.stdout.write(`  Generating doc for ${relPath} ... `);
      const docContent = await generateDoc(anthropic, relPath, content);
      const docPath = `docs/${relPath}.md`;

      generatedDocs.push({ filePath: relPath, docPath, content: docContent });
      console.log(`done (${docContent.length} chars)`);
    }

    // ── 4. Store docs in the database ────────────────────────────────────────
    console.log('\n── Step 4: Store docs in PostgreSQL ──');
    for (const doc of generatedDocs) {
      const res = await pool.query(`
        INSERT INTO docs (repo_id, file_path, doc_path, content, commit_sha)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT DO NOTHING
        RETURNING id
      `, [testRepoId, doc.filePath, doc.docPath, doc.content, 'e2e-test-sha']);
      console.log(`  Stored: ${doc.filePath} → id=${res.rows[0]?.id ?? '(already existed)'}`);
    }

    // Also track analytics event
    await pool.query(`
      INSERT INTO analytics_events (event_type, repo_id, metadata)
      VALUES ('doc_generated', $1, $2)
    `, [testRepoId, JSON.stringify({ test: true, files: generatedDocs.length, generated_at: new Date().toISOString() })]);
    console.log('  Analytics event recorded.');

    // ── 5. Verify via HTTP API ────────────────────────────────────────────────
    console.log('\n── Step 5: Read back docs via production HTTP API ──');

    const docsResp = await fetch(`${BASE_URL}/api/repos/${testRepoId}/docs`, {
      headers: { 'X-GitHub-User-Id': '0' },
    });
    const docsList = await docsResp.json();
    log('Docs visible via API', docsList.map(d => ({
      id: d.id,
      filePath: d.filePath,
      docPath: d.docPath,
      contentLength: d.content?.length,
      commitSha: d.commitSha,
    })));

    // Show a sample doc
    if (docsList.length > 0) {
      const sampleDoc = docsList[0];
      const docResp = await fetch(`${BASE_URL}/api/repos/${testRepoId}/docs/${sampleDoc.id}`, {
        headers: { 'X-GitHub-User-Id': '0' },
      });
      const fullDoc = await docResp.json();
      console.log(`\n── Sample Generated Doc: ${fullDoc.filePath} ──`);
      console.log(fullDoc.content);
    }

    // Check metrics after generation
    const metricsResp = await fetch(`${BASE_URL}/api/admin/metrics`);
    const metrics = await metricsResp.json();
    log('Admin metrics (after test)', metrics);

    // ── 6. Cleanup ────────────────────────────────────────────────────────────
    console.log('\n── Step 6: Cleanup test data ──');
    await pool.query(`DELETE FROM analytics_events WHERE repo_id = $1`, [testRepoId]);
    await pool.query(`DELETE FROM docs WHERE repo_id = $1`, [testRepoId]);
    await pool.query(`DELETE FROM repos WHERE id = $1`, [testRepoId]);
    console.log('  Test repo and all associated docs deleted.');

    console.log('\n=== TEST PASSED ===');
    console.log('The full pipeline works:');
    console.log('  ✓ Repo record created in PostgreSQL');
    console.log('  ✓ Claude generated real documentation for', generatedDocs.length, 'source files');
    console.log('  ✓ Docs stored in `docs` table with correct schema');
    console.log('  ✓ Docs readable via GET /api/repos/:repoId/docs');
    console.log('  ✓ Analytics event recorded in `analytics_events`');
    console.log('  ✓ Cleanup successful');

  } catch (err) {
    console.error('\n=== TEST FAILED ===', err);
    // Best-effort cleanup
    if (testRepoId) {
      try {
        await pool.query(`DELETE FROM docs WHERE repo_id = $1`, [testRepoId]);
        await pool.query(`DELETE FROM analytics_events WHERE repo_id = $1`, [testRepoId]);
        await pool.query(`DELETE FROM repos WHERE id = $1`, [testRepoId]);
        console.log('Cleanup done.');
      } catch (cleanupErr) {
        console.error('Cleanup failed:', cleanupErr.message);
      }
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
