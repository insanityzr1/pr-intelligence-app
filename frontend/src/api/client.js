const API_BASE = '/api';

export async function fetchPRs() {
  const res = await fetch(`${API_BASE}/prs`);
  if (!res.ok) throw new Error('Failed to fetch PRs');
  return res.json();
}

export async function syncPRs(count = 40, state = 'open', orderby = 'updated-desc') {
  const res = await fetch(`${API_BASE}/prs/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ count, state, orderby })
  });
  if (!res.ok) throw new Error('Failed to sync PRs');
  return res.json();
}

export async function fetchPRDetail(prNumber) {
  const res = await fetch(`${API_BASE}/prs/${prNumber}`);
  if (!res.ok) throw new Error('Failed to fetch PR detail');
  return res.json();
}

export async function analyzePRs(prNumbers, force = false) {
  const res = await fetch(`${API_BASE}/prs/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pr_numbers: prNumbers, force })
  });
  if (!res.ok) throw new Error('Failed to analyze PRs');
  return res.json();
}

export async function fetchConflicts() {
  const res = await fetch(`${API_BASE}/conflicts`);
  if (!res.ok) throw new Error('Failed to fetch conflicts');
  return res.json();
}

export async function generateChangelog(prNumbers) {
  const res = await fetch(`${API_BASE}/changelog`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pr_numbers: prNumbers })
  });
  if (!res.ok) throw new Error('Failed to generate changelog');
  return res.json();
}
