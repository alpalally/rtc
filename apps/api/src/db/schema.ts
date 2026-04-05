import { pgTable, uuid, bigint, text, jsonb, timestamp } from 'drizzle-orm/pg-core';

export const repos = pgTable('repos', {
  id: uuid('id').primaryKey().defaultRandom(),
  githubRepoId: bigint('github_repo_id', { mode: 'number' }).unique().notNull(),
  installationId: bigint('installation_id', { mode: 'number' }).notNull(),
  githubAccountId: bigint('github_account_id', { mode: 'number' }),
  owner: text('owner').notNull(),
  name: text('name').notNull(),
  defaultBranch: text('default_branch').notNull().default('main'),
  config: jsonb('config').$type<{
    filePatterns: string[];
    docStyle: string;
    targetBranch: string;
  }>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const docs = pgTable('docs', {
  id: uuid('id').primaryKey().defaultRandom(),
  repoId: uuid('repo_id').references(() => repos.id).notNull(),
  filePath: text('file_path').notNull(),
  docPath: text('doc_path').notNull(),
  content: text('content').notNull(),
  commitSha: text('commit_sha').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const syncEvents = pgTable('sync_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  repoId: uuid('repo_id').references(() => repos.id).notNull(),
  commitSha: text('commit_sha').notNull(),
  status: text('status').notNull().$type<'queued' | 'processing' | 'done' | 'failed'>(),
  triggeredBy: text('triggered_by').notNull().$type<'push' | 'pull_request' | 'manual'>(),
  filesChanged: jsonb('files_changed').$type<string[]>(),
  docsUpdated: jsonb('docs_updated').$type<string[]>(),
  errorMessage: text('error_message'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  githubId: bigint('github_id', { mode: 'number' }).unique().notNull(),
  login: text('login').notNull(),
  email: text('email'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const repoMembers = pgTable('repo_members', {
  userId: uuid('user_id').references(() => users.id).notNull(),
  repoId: uuid('repo_id').references(() => repos.id).notNull(),
  role: text('role').notNull().$type<'owner' | 'viewer'>(),
});

export const analyticsEvents = pgTable('analytics_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventType: text('event_type').notNull().$type<'app_installed' | 'push_received' | 'doc_generated' | 'doc_viewed'>(),
  repoId: uuid('repo_id').references(() => repos.id),
  docId: uuid('doc_id').references(() => docs.id),
  userId: uuid('user_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
