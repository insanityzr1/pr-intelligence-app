import React, { useCallback, useEffect, useState } from 'react';
import { simulateBuild, fetchBuildReadiness, fetchBuildStatus, buildPatchUrl } from '../api/client';
import { useToast } from './ToastProvider';

/**
 * Workspace-as-candidate-build.
 *
 * Runs a real `git merge-tree` simulation over the workspace's PRs and reports
 * what breaks. Until now the workspace showed no conflict information at all —
 * you could stage six mutually-conflicting PRs for a release with no warning,
 * because the only conflict signal in the app was GitHub's per-PR `mergeable`
 * flag, which answers "does this merge into main?" and never "do these merge
 * into each other?".
 */
export default function BuildPanel({ groupId, groupName, prCount }) {
  const toast = useToast();
  const [capability, setCapability] = useState(null);
  const [result, setResult] = useState(null);
  const [readiness, setReadiness] = useState(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await fetchBuildStatus();
        if (!cancelled) setCapability(status || null);
      } catch (err) {
        console.error(err);
        if (!cancelled) setCapability({ enabled: false, reason: err.message });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // A simulation is only valid for the workspace it was run against.
  useEffect(() => {
    setResult(null);
    setReadiness(null);
  }, [groupId]);

  const run = useCallback(async () => {
    if (!groupId) return;
    setRunning(true);
    try {
      const data = await fetchBuildReadiness({ groupId });
      setResult(data.simulation);
      setReadiness(data.readiness);

      if (data.simulation?.available === false) {
        toast.info(data.simulation.reason || 'Merge simulation unavailable.');
      } else if (data.simulation?.clean) {
        toast.success('All PRs merge cleanly.');
      } else {
        toast.error('This build has merge conflicts.');
      }
    } catch (err) {
      console.error(err);
      toast.error(`Build simulation failed: ${err.message}`);
    } finally {
      setRunning(false);
    }
  }, [groupId, toast]);

  if (!groupId) return null;

  const disabled = running || prCount === 0 || capability?.enabled === false;

  return (
    <div className="build-panel">
      <div className="build-panel-head">
        <div>
          <h4>🏗️ Build Simulation</h4>
          <p className="subtitle">
            Merges these {prCount} PR{prCount === 1 ? '' : 's'} together with real git —
            not just each one against its base.
          </p>
        </div>
        <div className="build-panel-actions">
          <button className="btn btn-primary" onClick={run} disabled={disabled}>
            {running ? 'Simulating…' : '▶ Run Simulation'}
          </button>
          {result?.clean && (
            <a className="btn btn-secondary" href={buildPatchUrl(groupId)} download>
              ⬇ Download Patch
            </a>
          )}
        </div>
      </div>

      {capability?.enabled === false && (
        <div className="build-unavailable" role="status">
          ⚠️ Real merge simulation is unavailable{capability.reason ? `: ${capability.reason}` : ''}.
          Conflict data falls back to GitHub's per-PR flag, which cannot detect PR-to-PR conflicts.
        </div>
      )}

      {readiness && <ReadinessGate readiness={readiness} />}

      {result && <SimulationResult result={result} groupName={groupName} />}
    </div>
  );
}

function ReadinessGate({ readiness }) {
  const { blockers, warnings } = readiness;

  const groups = [
    { key: 'conflicting', label: 'Merge conflicts', icon: '⚔️' },
    { key: 'failing_ci', label: 'Failing CI', icon: '❌' },
    { key: 'changes_requested', label: 'Changes requested', icon: '🔁' },
    { key: 'unapproved', label: 'Awaiting approval', icon: '👀' },
    { key: 'drafts', label: 'Still draft', icon: '📝' },
  ].filter(g => (blockers[g.key] || []).length > 0);

  if (readiness.ready) {
    return (
      <div className="readiness-gate ready" role="status">
        ✅ <strong>Ready to ship.</strong> All {readiness.total_prs} PRs merge cleanly, pass CI, and are approved.
      </div>
    );
  }

  return (
    <div className="readiness-gate blocked" role="status">
      <div className="readiness-head">
        🚧 <strong>{readiness.blocker_count} ship blocker{readiness.blocker_count === 1 ? '' : 's'}</strong>
        {readiness.shippable_with_review && ' — only approvals outstanding'}
      </div>
      <div className="readiness-groups">
        {groups.map(g => (
          <div key={g.key} className="readiness-group">
            <span className="readiness-group-label">{g.icon} {g.label}</span>
            <span className="readiness-prs">
              {blockers[g.key].map(b => (
                <span key={`${b.repo_name}#${b.pr_number}`} className="pr-chip-sm" title={b.title}>
                  #{b.pr_number}
                  {b.failed_checks?.length > 0 && (
                    <em className="failed-check"> ({b.failed_checks.slice(0, 2).join(', ')})</em>
                  )}
                </span>
              ))}
            </span>
          </div>
        ))}
        {warnings?.pending_ci?.length > 0 && (
          <div className="readiness-group warning">
            <span className="readiness-group-label">⏳ CI still running</span>
            <span className="readiness-prs">
              {warnings.pending_ci.map(b => (
                <span key={`${b.repo_name}#${b.pr_number}`} className="pr-chip-sm">#{b.pr_number}</span>
              ))}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function SimulationResult({ result }) {
  if (result.available === false) return null;

  return (
    <div className="simulation-results">
      {result.repos.map(repo => (
        <div key={repo.repo_name} className="simulation-repo">
          <div className="simulation-repo-head">
            <code>{repo.repo_name}</code>
            <span className="muted">onto {repo.base_branch}</span>
            <span className={`badge ${repo.clean ? 'badge-clean' : 'badge-conflict'}`}>
              {repo.clean ? 'Merges clean' : `${repo.blocked.length} blocked`}
            </span>
          </div>

          {repo.available === false ? (
            <div className="empty-box">Unavailable: {repo.reason}</div>
          ) : (
            <>
              {/* Cumulative result: the order PRs land in changes what breaks. */}
              <ol className="merge-steps">
                {repo.steps.map(step => (
                  <li key={step.label} className={step.clean ? 'step-clean' : 'step-conflict'}>
                    <span className="step-icon">{step.clean ? '✅' : '⚠️'}</span>
                    <span className="step-label">{step.label}</span>
                    {step.error ? (
                      <span className="step-detail">could not be fetched — {step.error}</span>
                    ) : step.clean ? (
                      <span className="step-detail muted">merges cleanly onto the accumulated build</span>
                    ) : (
                      <span className="step-detail">
                        conflicts in {step.conflicts.map(f => <code key={f}>{f}</code>)}
                      </span>
                    )}
                  </li>
                ))}
              </ol>

              {repo.conflict_pairs.length > 0 && (
                <div className="conflict-pairs">
                  <h5>Conflicting pairs</h5>
                  <p className="subtitle">
                    These PRs collide with each other, regardless of merge order.
                  </p>
                  <ul>
                    {repo.conflict_pairs.map(pair => (
                      <li key={`${pair.a}-${pair.b}`}>
                        <strong>{pair.a}</strong> ↔ <strong>{pair.b}</strong>
                        <span className="muted"> in </span>
                        {pair.files.map(f => <code key={f}>{f}</code>)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {repo.pairwise_truncated && (
                <div className="muted small">
                  Pairwise matrix skipped — too many PRs in this workspace.
                </div>
              )}

              {!repo.clean && repo.suggested_order?.length > 0 && (
                <div className="suggested-order">
                  <h5>Suggested merge order</h5>
                  <p className="subtitle">
                    Least-entangled first, so most of the set can land before the conflicts are resolved.
                  </p>
                  <div className="order-chips">
                    {repo.suggested_order.map((num, i) => (
                      <span key={num} className="order-chip">
                        <span className="order-index">{i + 1}</span>#{num}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}
