import React, { useState, useEffect } from 'react';
import { simulateMergeTrain, publishMergeTrain, fetchMergeTrainStatus } from '../api/client';
import { useToast } from './ToastProvider';
import { prNumberOf } from '../utils/prStats';

export default function MergeTrainTab({ prs = [], onSelectPr }) {
  const toast = useToast();
  const [capability, setCapability] = useState({ enabled: true });
  const [queue, setQueue] = useState([]);
  const [baseBranch, setBaseBranch] = useState('main');
  const [autoOrder, setAutoOrder] = useState(true);

  const [simulating, setSimulating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [simulationResult, setSimulationResult] = useState(null);

  // Staging deployment options
  const [stagingBranchName, setStagingBranchName] = useState('');
  const [createDraftPr, setCreateDraftPr] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchMergeTrainStatus();
        if (!cancelled) setCapability(res);
      } catch (err) {
        console.error(err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Initialize queue with first few open PRs if empty
  useEffect(() => {
    if (queue.length === 0 && prs.length > 0) {
      // Pick up to 4 open PRs as default queue
      const initial = prs.filter(p => p.status === 'Open' || p.status === 'open').slice(0, 4);
      setQueue(initial);
    }
  }, [prs]);

  function addToQueue(pr) {
    const num = prNumberOf(pr);
    if (!queue.some(p => prNumberOf(p) === num)) {
      setQueue(prev => [...prev, pr]);
    }
  }

  function removeFromQueue(prNumber) {
    setQueue(prev => prev.filter(p => prNumberOf(p) !== prNumber));
  }

  function moveUp(index) {
    if (index <= 0) return;
    setQueue(prev => {
      const copy = [...prev];
      const temp = copy[index - 1];
      copy[index - 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
  }

  function moveDown(index) {
    if (index >= queue.length - 1) return;
    setQueue(prev => {
      const copy = [...prev];
      const temp = copy[index + 1];
      copy[index + 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
  }

  async function handleSimulate() {
    if (queue.length === 0) {
      toast.error('Add at least one PR to the Merge Train queue.');
      return;
    }

    setSimulating(true);
    setSimulationResult(null);

    try {
      const res = await simulateMergeTrain({
        prNumbers: queue.map(p => prNumberOf(p)),
        repoName: queue[0]?.repo_name,
        baseBranch,
        autoOrder
      });

      const sim = res.result;
      setSimulationResult(sim);
      setStagingBranchName(sim.staging_branch_candidate || `staging/merge-train-${Date.now()}`);

      if (sim.status === 'clean') {
        toast.success(`Merge train simulation succeeded! All ${sim.clean_count} PRs merged cleanly.`);
      } else if (sim.status === 'partial') {
        toast.warning(`Partial train: ${sim.clean_count} passed, ${sim.blocked_count} collided.`);
      } else {
        toast.error(`Train blocked: collision encountered on base branch.`);
      }
    } catch (err) {
      console.error(err);
      toast.error(`Simulation failed: ${err.message}`);
    } finally {
      setSimulating(false);
    }
  }

  async function handlePublish() {
    if (!simulationResult?.final_commit) {
      toast.error('No valid simulated commit tree available to publish.');
      return;
    }

    setPublishing(true);
    try {
      const res = await publishMergeTrain({
        stagingBranch: stagingBranchName,
        finalCommit: simulationResult.final_commit,
        repoName: simulationResult.repo_name,
        prNumbers: simulationResult.clean_prs,
        createPr: createDraftPr,
        prTitle: `🚀 Staging Integration Candidate: ${stagingBranchName}`
      });

      toast.success(`Published staging branch: ${res.result?.staging_branch}`);
      if (res.result?.pr?.url) {
        window.open(res.result.pr.url, '_blank');
      }
    } catch (err) {
      console.error(err);
      toast.error(`Publish failed: ${err.message}`);
    } finally {
      setPublishing(false);
    }
  }

  const unqueuedPrs = prs.filter(p => !queue.some(q => prNumberOf(q) === prNumberOf(p)));

  return (
    <div className="merge-train-container">
      {/* Top Banner */}
      <div className="train-header-card">
        <div className="train-header-text">
          <h2>🚆 Virtual Merge Train & Speculative Simulator</h2>
          <p className="subtitle">
            Simulate combining multiple PRs in sequence before landing on <code>{baseBranch}</code>. Accurately detect collisions, isolate breaking changes, and publish clean staging branches to GitHub.
          </p>
        </div>

        <div className="train-controls-row">
          <div className="train-config-group">
            <label>Target Base:</label>
            <input
              type="text"
              value={baseBranch}
              onChange={e => setBaseBranch(e.target.value)}
              className="train-input-sm"
              placeholder="main"
            />
          </div>

          <label className="train-checkbox-label">
            <input
              type="checkbox"
              checked={autoOrder}
              onChange={e => setAutoOrder(e.target.checked)}
            />
            Auto-order (DAG & Low Conflicts)
          </label>

          <button
            onClick={handleSimulate}
            disabled={simulating || queue.length === 0}
            className="btn btn-primary"
          >
            {simulating ? '⚙️ Simulating...' : '🚆 Run Merge Train Simulation'}
          </button>
        </div>
      </div>

      {/* Main Grid: Queue on Left, Results on Right */}
      <div className="train-content-grid">
        {/* Left Column: Queue Manager */}
        <div className="train-queue-col">
          <div className="train-card">
            <div className="train-card-header">
              <h3>📦 Train Queue ({queue.length})</h3>
              {queue.length > 0 && (
                <button className="btn btn-link-sm" onClick={() => setQueue([])}>Clear All</button>
              )}
            </div>

            {queue.length === 0 ? (
              <div className="empty-box">No PRs in the merge queue. Select PRs below to add them to the train.</div>
            ) : (
              <div className="train-queue-list">
                {queue.map((p, idx) => {
                  const num = prNumberOf(p);
                  return (
                    <div key={num} className="train-queue-item">
                      <div className="queue-item-order">#{idx + 1}</div>
                      <div className="queue-item-details" onClick={() => onSelectPr?.(num, p.repo_name)}>
                        <strong>PR #{num}</strong>: {p.title}
                        <span className="queue-author">@{p.author}</span>
                      </div>
                      <div className="queue-item-actions">
                        <button
                          className="btn-icon"
                          onClick={() => moveUp(idx)}
                          disabled={idx === 0}
                          title="Move earlier in train"
                        >▲</button>
                        <button
                          className="btn-icon"
                          onClick={() => moveDown(idx)}
                          disabled={idx === queue.length - 1}
                          title="Move later in train"
                        >▼</button>
                        <button
                          className="btn-icon btn-danger-icon"
                          onClick={() => removeFromQueue(num)}
                          title="Remove from train"
                        >&times;</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Available to Add Drawer / Accordion */}
            {unqueuedPrs.length > 0 && (
              <div className="train-available-prs">
                <h4>➕ Available PRs ({unqueuedPrs.length})</h4>
                <div className="available-prs-scroll">
                  {unqueuedPrs.map(p => {
                    const num = prNumberOf(p);
                    return (
                      <div key={num} className="available-pr-row">
                        <span className="available-pr-title">#{num}: {p.title}</span>
                        <button className="btn btn-secondary btn-sm" onClick={() => addToQueue(p)}>+ Add</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Simulation Results & Train visualization */}
        <div className="train-results-col">
          {simulating ? (
            <div className="train-card simulation-loading-card">
              <div className="loading-spinner">🚆</div>
              <h3>Simulating Merge Sequence in Ephemeral Git Workspace...</h3>
              <p className="subtitle">Calculating virtual git trees and attributing conflict collisions step-by-step.</p>
            </div>
          ) : simulationResult ? (
            <div className="train-results-container">
              {/* Verdict Banner */}
              <div className={`train-verdict-banner ${simulationResult.status}`}>
                <div className="verdict-icon">
                  {simulationResult.status === 'clean' ? '🟢' : simulationResult.status === 'partial' ? '🟡' : '🔴'}
                </div>
                <div className="verdict-text">
                  <h3>
                    {simulationResult.status === 'clean'
                      ? 'Merge Train Complete — 100% Clean!'
                      : simulationResult.status === 'partial'
                      ? 'Partial Train Success — Collisions Isolated'
                      : 'Train Derailed — Blocker on Base Branch'}
                  </h3>
                  <p>
                    {simulationResult.clean_count} of {simulationResult.total_prs} PRs successfully merged in sequential order.
                  </p>
                </div>
              </div>

              {/* Step-by-Step Train Cars Visualization */}
              <div className="train-card">
                <h3>Visual Train Sequence</h3>
                <div className="train-tracks">
                  <div className="train-locomotive">
                    <span className="loco-icon">🚂</span>
                    <span className="loco-label">{baseBranch}</span>
                  </div>

                  {simulationResult.steps?.map((step, idx) => (
                    <div
                      key={step.pr_number}
                      className={`train-car ${step.clean ? 'clean' : 'collided'}`}
                      onClick={() => onSelectPr?.(step.pr_number, simulationResult.repo_name)}
                    >
                      <div className="train-coupler">➔</div>
                      <div className="train-car-box">
                        <div className="car-header">
                          <span className="car-num">#{step.pr_number}</span>
                          <span className="car-status-pill">{step.clean ? 'PASS' : 'FAIL'}</span>
                        </div>
                        <div className="car-title">{step.title || `PR #${step.pr_number}`}</div>
                        {step.conflicts?.length > 0 && (
                          <div className="car-conflicts">
                            ⚠️ {step.conflicts.length} conflict file(s)
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Collisions Breakdown (if any) */}
              {simulationResult.blocked_count > 0 && (
                <div className="train-card conflict-breakdown-card">
                  <h4 className="card-title-danger">⚠️ Collision Breakdown</h4>
                  <p className="subtitle">The following PRs derailed because they modify overlapping regions with earlier train cars or base branch:</p>
                  <div className="conflict-steps-list">
                    {simulationResult.steps.filter(s => !s.clean).map(s => (
                      <div key={s.pr_number} className="conflict-step-item">
                        <strong>PR #{s.pr_number} ({s.title})</strong>
                        {s.conflicts?.length > 0 ? (
                          <ul className="conflict-files-list">
                            {s.conflicts.map((file, i) => <li key={i}><code>{file}</code></li>)}
                          </ul>
                        ) : (
                          <p className="error-note">{s.error || 'Conflict or git ref error.'}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 1-Click Staging Deployment Card */}
              {simulationResult.can_publish_staging && (
                <div className="train-card staging-deploy-card">
                  <h3>🚀 Deploy Validated Staging Branch to GitHub</h3>
                  <p className="subtitle">
                    Push the validated {simulationResult.clean_count} merged PRs to an integration branch for end-to-end testing or draft release opening.
                  </p>

                  <div className="staging-form-row">
                    <div className="staging-input-field">
                      <label>Target Staging Branch:</label>
                      <input
                        type="text"
                        value={stagingBranchName}
                        onChange={e => setStagingBranchName(e.target.value)}
                        className="train-input-staging"
                      />
                    </div>

                    <label className="train-checkbox-label">
                      <input
                        type="checkbox"
                        checked={createDraftPr}
                        onChange={e => setCreateDraftPr(e.target.checked)}
                      />
                      Open Draft PR on GitHub
                    </label>

                    <button
                      onClick={handlePublish}
                      disabled={publishing}
                      className="btn btn-success"
                    >
                      {publishing ? 'Publishing...' : '🚀 Publish Staging Branch'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="train-card empty-results-card">
              <div className="empty-illustration">🚆</div>
              <h3>No Simulation Run Yet</h3>
              <p className="subtitle">
                Configure your PR queue on the left and click <strong>Run Merge Train Simulation</strong> to test multi-PR merging.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
