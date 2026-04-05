'use client';

import { useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type State = 'idle' | 'down_comment' | 'submitting' | 'done';

export function FeedbackWidget({ repoId, docId }: { repoId: string; docId: string }) {
  const [state, setState] = useState<State>('idle');
  const [comment, setComment] = useState('');

  async function submit(rating: 'up' | 'down', commentText?: string) {
    setState('submitting');
    await fetch(`${API_URL}/api/repos/${repoId}/docs/${docId}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating, comment: commentText || undefined }),
    });
    setState('done');
  }

  if (state === 'done') {
    return (
      <div className="mt-8 pt-6 border-t border-gray-800 text-sm text-gray-500 text-center">
        Thanks for your feedback!
      </div>
    );
  }

  return (
    <div className="mt-8 pt-6 border-t border-gray-800">
      <p className="text-sm text-gray-500 mb-3 text-center">Was this doc helpful?</p>
      {state === 'idle' && (
        <div className="flex justify-center gap-4">
          <button
            onClick={() => submit('up')}
            className="text-2xl hover:scale-110 transition-transform"
            aria-label="Thumbs up"
          >
            👍
          </button>
          <button
            onClick={() => setState('down_comment')}
            className="text-2xl hover:scale-110 transition-transform"
            aria-label="Thumbs down"
          >
            👎
          </button>
        </div>
      )}
      {state === 'down_comment' && (
        <div className="max-w-md mx-auto">
          <label className="block text-sm text-gray-400 mb-2">What could be better?</label>
          <textarea
            className="w-full bg-gray-800 text-gray-200 text-sm rounded p-2 border border-gray-700 focus:outline-none focus:border-gray-500 resize-none"
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Optional — describe what was missing or confusing."
          />
          <div className="flex gap-2 mt-2 justify-end">
            <button
              onClick={() => submit('down', comment)}
              className="text-sm px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition"
            >
              Submit
            </button>
            <button
              onClick={() => setState('idle')}
              className="text-sm px-3 py-1 text-gray-500 hover:text-gray-300 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {state === 'submitting' && (
        <p className="text-center text-sm text-gray-500">Submitting…</p>
      )}
    </div>
  );
}
