const API_BASE = '/api';

export async function fetchPRs(repoName = null) {
  const url = repoName ? `${API_BASE}/prs?repo_name=${encodeURIComponent(repoName)}` : `${API_BASE}/prs`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch PRs');
  return res.json();
}

export async function syncPRs(count = 40, state = 'open', orderby = 'updated-desc', repoName = null) {
  const res = await fetch(`${API_BASE}/prs/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ count, state, orderby, repo_name: repoName })
  });
  if (!res.ok) throw new Error('Failed to sync PRs');
  return res.json();
}

export async function fetchPRDetail(prNumber, repoName = null) {
  const url = repoName ? `${API_BASE}/prs/${prNumber}?repo_name=${encodeURIComponent(repoName)}` : `${API_BASE}/prs/${prNumber}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch PR detail');
  return res.json();
}

export async function analyzePRs(prNumbers, force = false, repoName = null) {
  const res = await fetch(`${API_BASE}/prs/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pr_numbers: prNumbers, force, repo_name: repoName })
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

// Repositories API
export async function fetchRepos() {
  const res = await fetch(`${API_BASE}/repos`);
  if (!res.ok) throw new Error('Failed to fetch repositories');
  return res.json();
}

export async function addRepo(repoName) {
  const res = await fetch(`${API_BASE}/repos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo_name: repoName })
  });
  if (!res.ok) throw new Error('Failed to add repository');
  return res.json();
}

export async function deleteRepo(repoName) {
  const res = await fetch(`${API_BASE}/repos/${repoName}`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error('Failed to delete repository');
  return res.json();
}

// AI Chat API
export async function fetchPRChatHistory(prNumber, repoName = null) {
  const url = repoName ? `${API_BASE}/prs/${prNumber}/chat?repo_name=${encodeURIComponent(repoName)}` : `${API_BASE}/prs/${prNumber}/chat`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch chat history');
  return res.json();
}

export async function postPRChatMessage(prNumber, message, repoName = null) {
  const res = await fetch(`${API_BASE}/prs/${prNumber}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, repo_name: repoName })
  });
  if (!res.ok) throw new Error('Failed to post chat message');
  return res.json();
}

// AI Conflict Resolution API
export async function fetchConflictResolution(prNumber, repoName = null) {
  const url = repoName ? `${API_BASE}/prs/${prNumber}/resolve-conflicts?repo_name=${encodeURIComponent(repoName)}` : `${API_BASE}/prs/${prNumber}/resolve-conflicts`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to resolve conflicts');
  return res.json();
}
