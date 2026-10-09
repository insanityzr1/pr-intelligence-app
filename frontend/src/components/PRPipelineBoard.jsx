import React, { useMemo } from 'react';
import CIBadge from './CIBadge';
import { prNumberOf } from '../utils/prStats';

export default function PRPipelineBoard({ prs = [], onSelectPr }) {
  // Categorize PRs into the 4 lifecycle stages
  const columns = useMemo(() => {
    const stages = {
      needsReview: { id: 'needsReview', title: '👀 Needs Review', desc: 'Awaiting reviews or requested changes', prs: [] },
      ciBlocked: { id: 'ciBlocked', title: '🚨 CI Blocked', desc: 'Failing checks requiring triage', prs: [] },
      staging: { id: 'staging', title: '📦 In Staging', desc: 'Grouped or in conflict resolution', prs: [] },
      readyToLand: { id: 'readyToLand', title: '✨ Ready to Land', desc: 'Green checks and mergeable', prs: [] }
    };

    for (const pr of prs) {
      const isFailing = (pr.checks_state || '').toUpperCase() === 'FAILING' || (pr.current_status || '').toLowerCase().includes('fail');
      const isConflicting = pr.mergeable === 'CONFLICTING' || pr.status === 'Conflicting';
      const isPassing = (pr.checks_state || '').toUpperCase() === 'PASSING';
      const isApproved = (pr.review_decision || '').toUpperCase() === 'APPROVED';

      if (isFailing) {
        stages.ciBlocked.prs.push(pr);
      } else if (isConflicting || (pr.user_tags || []).some(t => t.toLowerCase().includes('workspace') || t.toLowerCase().includes('staging'))) {
        stages.staging.prs.push(pr);
      } else if (isPassing && (isApproved || pr.status === 'Open')) {
        stages.readyToLand.prs.push(pr);
      } else {
        stages.needsReview.prs.push(pr);
      }
    }

    return Object.values(stages);
  }, [prs]);

  return (
    <div className="pipeline-board-container" role="region" aria-label="PR Lifecycle Pipeline">
      <div className="pipeline-columns-grid">
        {columns.map(col => (
          <div key={col.id} className={`pipeline-column col-${col.id}`}>
            <div className="pipeline-column-header">
              <div className="column-title-row">
                <h3>{col.title}</h3>
                <span className="column-count-badge">{col.prs.length}</span>
              </div>
              <p className="column-desc">{col.desc}</p>
            </div>

            <div className="pipeline-cards-list">
              {col.prs.length === 0 ? (
                <div className="pipeline-empty-column">No PRs in this stage</div>
              ) : (
                col.prs.map(pr => {
                  const num = prNumberOf(pr);
                  const isFailing = (pr.checks_state || '').toUpperCase() === 'FAILING';

                  return (
                    <div
                      key={`${pr.repo_name}#${num}`}
                      className="pipeline-card"
                      onClick={() => onSelectPr?.(num, pr.repo_name)}
                    >
                      <div className="pipeline-card-top">
                        <span className="card-pr-id">#{num}</span>
                        {pr.repo_name && <span className="card-repo-tag">{pr.repo_name}</span>}
                        {pr.risk && (
                          <span className={`risk-badge risk-${pr.risk.toLowerCase()}`}>
                            {pr.risk} Risk
                          </span>
                        )}
                      </div>

                      <h4 className="pipeline-card-title">{pr.title}</h4>

                      <div className="pipeline-card-meta">
                        <span className="card-author">@{pr.author}</span>
                        <span className="card-updated">{pr.updated_rel || 'Recently'}</span>
                      </div>

                      <div className="pipeline-card-footer">
                        <CIBadge pr={pr} />

                        {pr.ai_review?.code_quality_score && (
                          <span className="score-pill" title="AI Code Quality Score">
                            ⭐ {pr.ai_review.code_quality_score}/100
                          </span>
                        )}

                        {isFailing && (
                          <button
                            className="btn btn-warning btn-xs card-action-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectPr?.(num, pr.repo_name, 'ci-triage');
                            }}
                          >
                            🛠️ Fix CI
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
