const API_BASE = '/api';

/**
 * Build an Error carrying the server's own message.
 *
 * Most wrappers used to throw a hardcoded string and discard the response body,
 * so FastAPI's `detail` — the only text that says what actually went wrong —
 * never reached the user.
 */
async function apiError(res, fallback) {
  let detail = '';
  try {
    const data = await res.json();
    detail = typeof data?.detail === 'string' ? data.detail : '';
  } catch {
    /* non-JSON body; fall through to the generic message */
  }
  const err = new Error(detail || fallback);
  err.status = res.status;
  return err;
}

export async function fetchPRs(repoName = null) {
  const url = repoName ? `${API_BASE}/prs?repo_name=${encodeURIComponent(repoName)}` : `${API_BASE}/prs`;
  const res = await fetch(url);
  if (!res.ok) throw await apiError(res,'Failed to fetch PRs');
  return res.json();
}

export async function syncPRs(count = null, state = 'open', orderby = 'updated-desc', repoName = null) {
  const res = await fetch(`${API_BASE}/prs/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ count, state, orderby, repo_name: repoName })
  });
  if (!res.ok) throw await apiError(res,'Failed to sync PRs');
  return res.json();
}

export async function fetchPRDetail(prNumber, repoName = null) {
  const url = repoName ? `${API_BASE}/prs/${prNumber}?repo_name=${encodeURIComponent(repoName)}` : `${API_BASE}/prs/${prNumber}`;
  const res = await fetch(url);
  if (!res.ok) throw await apiError(res,'Failed to fetch PR detail');
  return res.json();
}

export async function analyzePRs(prNumbers, force = false, repoName = null) {
  const res = await fetch(`${API_BASE}/prs/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pr_numbers: prNumbers, force, repo_name: repoName })
  });
  if (!res.ok) throw await apiError(res,'Failed to analyze PRs');
  return res.json();
}

export async function fetchConflicts() {
  const res = await fetch(`${API_BASE}/conflicts`);
  if (!res.ok) throw await apiError(res,'Failed to fetch conflicts');
  return res.json();
}

export async function generateChangelog(prNumbers, workspaceName = null) {
  const payload = { pr_numbers: prNumbers };
  if (workspaceName) payload.workspace_name = workspaceName;
  
  const res = await fetch(`${API_BASE}/changelog`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw await apiError(res,'Failed to generate changelog');
  return res.json();
}

export async function fetchChangelogs() {
  const res = await fetch(`${API_BASE}/changelog`);
  if (!res.ok) throw await apiError(res,'Failed to fetch changelogs');
  return res.json();
}

export async function deleteChangelog(changelogId) {
  const res = await fetch(`${API_BASE}/changelog/${changelogId}`, { method: 'DELETE' });
  if (!res.ok) throw await apiError(res,'Failed to delete changelog');
  return res.json();
}

// Repositories API
export async function fetchRepos() {
  const res = await fetch(`${API_BASE}/repos`);
  if (!res.ok) throw await apiError(res,'Failed to fetch repositories');
  return res.json();
}

export async function addRepo(repoName) {
  const res = await fetch(`${API_BASE}/repos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo_name: repoName })
  });
  if (!res.ok) throw await apiError(res,'Failed to add repository');
  return res.json();
}

export async function deleteRepo(repoName) {
  const res = await fetch(`${API_BASE}/repos/${repoName}`, {
    method: 'DELETE'
  });
  if (!res.ok) throw await apiError(res,'Failed to delete repository');
  return res.json();
}

// AI Chat API
export async function fetchPRChatHistory(prNumber, repoName = null) {
  const url = repoName ? `${API_BASE}/prs/${prNumber}/chat?repo_name=${encodeURIComponent(repoName)}` : `${API_BASE}/prs/${prNumber}/chat`;
  const res = await fetch(url);
  if (!res.ok) throw await apiError(res,'Failed to fetch chat history');
  return res.json();
}

export async function postPRChatMessage(prNumber, message, repoName = null) {
  const res = await fetch(`${API_BASE}/prs/${prNumber}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, repo_name: repoName })
  });
  if (!res.ok) throw await apiError(res,'Failed to post chat message');
  return res.json();
}

// AI Conflict Resolution API
export async function fetchConflictResolution(prNumber, repoName = null) {
  const url = repoName ? `${API_BASE}/prs/${prNumber}/resolve-conflicts?repo_name=${encodeURIComponent(repoName)}` : `${API_BASE}/prs/${prNumber}/resolve-conflicts`;
  const res = await fetch(url);
  if (!res.ok) throw await apiError(res,'Failed to resolve conflicts');
  return res.json();
}

// Custom Tags & Staging Groups API
export async function fetchTagsMap() {
  const res = await fetch(`${API_BASE}/tags`);
  if (!res.ok) throw await apiError(res,'Failed to fetch tags');
  return res.json();
}

export async function addPRTag(prNumber, tag, repoName = null) {
  const res = await fetch(`${API_BASE}/prs/${prNumber}/tags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag, repo_name: repoName })
  });
  if (!res.ok) throw await apiError(res,'Failed to add tag');
  return res.json();
}

export async function removePRTag(prNumber, tag, repoName = null) {
  const url = repoName ? `${API_BASE}/prs/${prNumber}/tags/${encodeURIComponent(tag)}?repo_name=${encodeURIComponent(repoName)}` : `${API_BASE}/prs/${prNumber}/tags/${encodeURIComponent(tag)}`;
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) throw await apiError(res,'Failed to remove tag');
  return res.json();
}

export async function fetchGroups() {
  const res = await fetch(`${API_BASE}/groups`);
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || 'Failed to fetch groups');
  }
  return res.json();
}

export async function createGroup(name, description = '') {
  const res = await fetch(`${API_BASE}/groups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description })
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || 'Failed to create group');
  }
  return res.json();
}

export async function updateGroup(groupId, name, description = '') {
  const res = await fetch(`${API_BASE}/groups/${groupId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description })
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || 'Failed to update group');
  }
  return res.json();
}

export async function deleteGroup(groupId) {
  const res = await fetch(`${API_BASE}/groups/${groupId}`, { method: 'DELETE' });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || 'Failed to delete group');
  }
  return res.json();
}

export async function fetchGroupItems(groupId) {
  const res = await fetch(`${API_BASE}/groups/${groupId}/items`);
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || 'Failed to fetch group items');
  }
  return res.json();
}

export async function addPrsToGroup(groupId, prNumbers, repoName = null) {
  const res = await fetch(`${API_BASE}/groups/${groupId}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pr_numbers: prNumbers, repo_name: repoName })
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || 'Failed to add PRs to group');
  }
  return res.json();
}

export async function removePrFromGroup(groupId, prNumber, repoName = null) {
  const url = repoName ? `${API_BASE}/groups/${groupId}/items/${prNumber}?repo_name=${encodeURIComponent(repoName)}` : `${API_BASE}/groups/${groupId}/items/${prNumber}`;
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || 'Failed to remove PR from group');
  }
  return res.json();
}
