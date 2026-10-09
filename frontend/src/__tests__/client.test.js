import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  fetchPRs,
  syncPRs,
  fetchPRDetail,
  analyzePRs,
  fetchConflicts,
  generateChangelog,
  fetchChangelogs,
  deleteChangelog,
  fetchRepos,
  addRepo,
  deleteRepo,
  fetchPRChatHistory,
  postPRChatMessage,
  fetchConflictResolution,
  fetchTagsMap,
  addPRTag,
  removePRTag,
  fetchGroups,
  createGroup,
  deleteGroup,
  fetchGroupItems,
  addPrsToGroup,
  removePrFromGroup,
  triageCi,
  bulkTriageCi,
  applyCiFix,
  downloadCiPatchUrl
} from '../api/client';

describe('API Client Library', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetchPRs fetches list of pull requests', async () => {
    const mockData = [{ number: 1, title: 'PR 1' }];
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockData
    });

    const result = await fetchPRs();
    expect(global.fetch).toHaveBeenCalledWith('/api/prs', expect.objectContaining({
      headers: expect.objectContaining({ 'X-API-Key': 'dev-secret-key' })
    }));
    expect(result).toEqual(mockData);
  });

  it('syncPRs sends POST request to sync PRs', async () => {
    const mockRes = { status: 'success', prs: [] };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockRes
    });

    const result = await syncPRs(50, 'open', 'updated-desc', 'test/repo');
    expect(global.fetch).toHaveBeenCalledWith('/api/prs/sync', expect.objectContaining({
      method: 'POST'
    }));
    expect(result).toEqual(mockRes);
  });

  it('fetchPRDetail fetches individual PR detail', async () => {
    const mockPr = { number: 1874, title: 'Refactor template' };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockPr
    });

    const result = await fetchPRDetail(1874, 'test/repo');
    expect(global.fetch).toHaveBeenCalledWith('/api/prs/1874?repo_name=test%2Frepo', expect.objectContaining({
      headers: expect.objectContaining({ 'X-API-Key': 'dev-secret-key' })
    }));
    expect(result).toEqual(mockPr);
  });

  it('generateChangelog posts selected PR numbers', async () => {
    const mockChangelog = { markdown: '# Release Notes' };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockChangelog
    });

    const result = await generateChangelog([1874, 1881]);
    expect(global.fetch).toHaveBeenCalledWith('/api/changelog', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ pr_numbers: [1874, 1881] })
    }));
    expect(result).toEqual(mockChangelog);
  });

  it('fetchChangelogs fetches saved changelogs', async () => {
    const mockLogs = { changelogs: [{ id: 1, title: 'Release 1' }] };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockLogs
    });

    const result = await fetchChangelogs();
    expect(global.fetch).toHaveBeenCalledWith('/api/changelog', expect.objectContaining({
      headers: expect.objectContaining({ 'X-API-Key': 'dev-secret-key' })
    }));
    expect(result).toEqual(mockLogs);
  });

  it('addPRTag posts new tag to PR endpoint', async () => {
    const mockRes = { pr_number: 101, tags: ['⭐ Starred'] };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockRes
    });

    const result = await addPRTag(101, '⭐ Starred', 'test/repo');
    expect(global.fetch).toHaveBeenCalledWith('/api/prs/101/tags', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ tag: '⭐ Starred', repo_name: 'test/repo' })
    }));
    expect(result).toEqual(mockRes);
  });

  it('createGroup creates new staging bucket', async () => {
    const mockGroup = { status: 'success', group: { group_id: 1, name: 'v2.9' } };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockGroup
    });

    const result = await createGroup('v2.9', 'Release group');
    expect(global.fetch).toHaveBeenCalledWith('/api/groups', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ name: 'v2.9', description: 'Release group' })
    }));
    expect(result).toEqual(mockGroup);
  });

  it('triageCi sends POST request to PR ci-triage endpoint', async () => {
    const mockTriage = { status: 'success', triage: { failure_category: 'lint' } };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockTriage
    });

    const result = await triageCi(101, 'test/repo', { force: true });
    expect(global.fetch).toHaveBeenCalledWith('/api/prs/101/ci-triage', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ repo_name: 'test/repo', custom_log: null, force: true })
    }));
    expect(result).toEqual(mockTriage);
  });

  it('bulkTriageCi sends POST request to bulk triage endpoint', async () => {
    const mockBulk = { status: 'success', results: [] };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockBulk
    });

    const result = await bulkTriageCi([101, 102], 'test/repo');
    expect(global.fetch).toHaveBeenCalledWith('/api/prs/bulk/ci-triage', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ pr_numbers: [101, 102], repo_name: 'test/repo', force: false })
    }));
    expect(result).toEqual(mockBulk);
  });

  it('applyCiFix sends POST request to apply-fix endpoint', async () => {
    const mockApply = { status: 'success', result: { action: 'push_to_pr' } };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockApply
    });

    const result = await applyCiFix(101, { patch: 'diff', action: 'push_to_pr', repoName: 'test/repo' });
    expect(global.fetch).toHaveBeenCalledWith('/api/prs/101/apply-fix', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        patch: 'diff',
        action: 'push_to_pr',
        commit_message: null,
        repo_name: 'test/repo',
        branch_name: null
      })
    }));
    expect(result).toEqual(mockApply);
  });

  it('downloadCiPatchUrl builds query url correctly', () => {
    expect(downloadCiPatchUrl(101, 'test/repo')).toBe('/api/prs/101/download-patch?repo_name=test%2Frepo');
    expect(downloadCiPatchUrl(101)).toBe('/api/prs/101/download-patch');
  });
});

