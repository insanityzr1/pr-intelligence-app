import React from 'react';

const CHECK_STYLES = {
  PASSING: { icon: '✅', cls: 'ci-passing', label: 'CI passing' },
  FAILING: { icon: '❌', cls: 'ci-failing', label: 'CI failing' },
  PENDING: { icon: '⏳', cls: 'ci-pending', label: 'CI running' },
  NONE: { icon: '–', cls: 'ci-none', label: 'No checks' },
};

const REVIEW_STYLES = {
  APPROVED: { icon: '👍', cls: 'review-approved', label: 'Approved' },
  CHANGES_REQUESTED: { icon: '🔁', cls: 'review-changes', label: 'Changes requested' },
  REVIEW_REQUIRED: { icon: '👀', cls: 'review-required', label: 'Review required' },
};

/**
 * CI and review state for a PR.
 *
 * This data did not exist in the app before Phase 3 — `gh pr list --json` never
 * requested `statusCheckRollup` or `reviewDecision`, so nothing could tell you
 * whether a PR was actually shippable.
 */
export default function CIBadge({ pr, showReview = true }) {
  const checks = CHECK_STYLES[pr?.checks_state] || CHECK_STYLES.NONE;
  const review = REVIEW_STYLES[(pr?.review_decision || '').toUpperCase()];

  const failed = pr?.failed_checks || [];
  const checkTitle = failed.length
    ? `${checks.label}: ${failed.slice(0, 3).join(', ')}${failed.length > 3 ? '…' : ''}`
    : `${checks.label} (${pr?.checks_passed || 0} passed)`;

  return (
    <span className="ci-badge-group">
      <span className={`ci-badge ${checks.cls}`} title={checkTitle}>
        <span aria-hidden="true">{checks.icon}</span>
        <span className="sr-only">{checks.label}</span>
        {pr?.checks_failed > 0 && <span className="ci-count">{pr.checks_failed}</span>}
      </span>

      {showReview && review && (
        <span className={`ci-badge ${review.cls}`} title={review.label}>
          <span aria-hidden="true">{review.icon}</span>
          <span className="sr-only">{review.label}</span>
        </span>
      )}
    </span>
  );
}
