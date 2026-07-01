import { NextRequest, NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// Stores the activity log as a single JSON file inside a GitHub repo, using
// the GitHub Contents API. No database — the repo file IS the database.
//
// Required environment variables (set these on your host, never in the repo):
//   GITHUB_TOKEN   - a fine-grained PAT scoped to Contents: Read & Write
//                     on the target repo only
//   GITHUB_OWNER   - e.g. "your-username" or org name
//   GITHUB_REPO    - e.g. "echo-films-data"
//   GITHUB_PATH    - e.g. "activity-log.json"  (defaults below if unset)
//   GITHUB_BRANCH  - e.g. "main"               (defaults below if unset)
//
// This route is server-only. GITHUB_TOKEN is never sent to the browser.
// ---------------------------------------------------------------------------

interface ActivityLogEntry {
  id: string;
  type: 'auth' | 'section' | 'module_completed' | 'training_completed';
  message: string;
  timestamp: number;
}

const OWNER = process.env.GITHUB_OWNER;
const REPO = process.env.GITHUB_REPO;
const PATH = process.env.GITHUB_PATH || 'activity-log.json';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const TOKEN = process.env.GITHUB_TOKEN;

const API_BASE = 'https://api.github.com';

function assertConfigured() {
  if (!TOKEN || !OWNER || !REPO) {
    throw new Error('Missing GITHUB_TOKEN, GITHUB_OWNER, or GITHUB_REPO environment variables.');
  }
}

async function getFile(): Promise<{ entries: ActivityLogEntry[]; sha: string | null }> {
  const res = await fetch(
    `${API_BASE}/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(PATH)}?ref=${BRANCH}`,
    {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: 'application/vnd.github+json',
      },
      cache: 'no-store',
    }
  );

  if (res.status === 404) {
    return { entries: [], sha: null };
  }
  if (!res.ok) {
    throw new Error(`GitHub read failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const decoded = Buffer.from(data.content, 'base64').toString('utf-8');
  let entries: ActivityLogEntry[] = [];
  try {
    entries = JSON.parse(decoded);
  } catch {
    entries = [];
  }
  return { entries, sha: data.sha };
}

async function putFile(entries: ActivityLogEntry[], sha: string | null, message: string) {
  const content = Buffer.from(JSON.stringify(entries, null, 2), 'utf-8').toString('base64');

  const res = await fetch(`${API_BASE}/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(PATH)}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      content,
      branch: BRANCH,
      ...(sha ? { sha } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    const err: any = new Error(`GitHub write failed: ${res.status} ${body}`);
    err.status = res.status;
    throw err;
  }

  return res.json();
}

// GET /api/activity-log — return the full log
export async function GET() {
  try {
    assertConfigured();
    const { entries } = await getFile();
    return NextResponse.json({ entries });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/activity-log — append one entry, with a couple of retries in
// case two writes race for the same file sha (GitHub returns 409).
export async function POST(req: NextRequest) {
  try {
    assertConfigured();
    const entry: ActivityLogEntry = await req.json();

    if (!entry?.id || !entry?.type || !entry?.message || !entry?.timestamp) {
      return NextResponse.json({ error: 'Invalid log entry' }, { status: 400 });
    }

    let attempt = 0;
    let lastError: any;

    while (attempt < 3) {
      try {
        const { entries, sha } = await getFile();
        if (entries.some((e) => e.id === entry.id)) {
          return NextResponse.json({ entries }); // already written, avoid duplicate commit
        }
        const updated = [...entries, entry];
        await putFile(updated, sha, `log: ${entry.type} — ${entry.message}`);
        return NextResponse.json({ entries: updated });
      } catch (err: any) {
        lastError = err;
        if (err.status === 409) {
          attempt += 1;
          continue; // sha changed underneath us — refetch and retry
        }
        throw err;
      }
    }

    throw lastError;
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}