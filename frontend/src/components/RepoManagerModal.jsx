import React, { useState, useEffect } from 'react';
import { fetchRepos, addRepo, deleteRepo } from '../api/client';
import { useToast } from './ToastProvider';

export default function RepoManagerModal({ onClose, onReposUpdated }) {
  const toast = useToast();
  const [repos, setRepos] = useState([]);
  const [newRepo, setNewRepo] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    loadRepos();

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  async function loadRepos() {
    setLoading(true);
    try {
      const data = await fetchRepos();
      setRepos(data.repositories || []);
    } catch (err) {
      setError('Failed to load repositories.');
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!newRepo.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await addRepo(newRepo.trim());
      setRepos(res.repositories || []);
      setNewRepo('');
      if (onReposUpdated) onReposUpdated();
    } catch (err) {
      setError('Failed to add repository. Format must be owner/repo.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(repoName) {
    const confirmed = await toast.confirm({
      title: 'Remove repository?',
      message: `"${repoName}" will be removed from this app. Its cached PRs, tags, and AI reviews stay in the database, and the repository on GitHub is not touched.`,
      confirmLabel: 'Remove Repository',
    });
    if (!confirmed) return;

    try {
      const res = await deleteRepo(repoName);
      setRepos(res.repositories || []);
      if (onReposUpdated) onReposUpdated();
      toast.success(`Removed ${repoName}.`);
    } catch (err) {
      setError(err.message || 'Failed to delete repository.');
      toast.error(`Could not remove ${repoName}: ${err.message}`);
    }
  }

  return (
    <div className="drawer-backdrop modal-backdrop-center" onClick={onClose}>
      <div className="drawer-content modal-narrow" onClick={e => e.stopPropagation()}>
        <div className="drawer-header">
          <h2>⚙️ Repository Manager</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="drawer-body">
          <form onSubmit={handleAdd} className="add-repo-form">
            <label>Add GitHub Repository (`owner/repo`)</label>
            <div className="form-row">
              <input
                type="text"
                placeholder="e.g. owner/my-repository"
                value={newRepo}
                onChange={e => setNewRepo(e.target.value)}
                disabled={submitting}
              />
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Adding...' : 'Add Repo'}
              </button>
            </div>
            {error && <p className="error-text">{error}</p>}
          </form>

          <div className="repo-list-section">
            <h3>Configured Repositories</h3>
            {loading ? (
              <div className="loading">Loading repos...</div>
            ) : repos.length === 0 ? (
              <div className="empty-box">No repositories configured yet.</div>
            ) : (
              <div className="repo-items">
                {repos.map(r => (
                  <div key={r.repo_name} className="repo-item">
                    <span>{r.repo_name}</span>
                    <button onClick={() => handleDelete(r.repo_name)} className="btn-icon-danger">&times; Remove</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
