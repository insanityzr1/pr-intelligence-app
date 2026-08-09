import React from 'react';

const TERMINAL = ['done', 'failed', 'cancelled', 'completed_with_errors'];

export const isJobFinished = (status) => TERMINAL.includes(status);

/**
 * Live progress for a queued AI job.
 *
 * Batch review was previously one opaque multi-minute await ending in a native
 * `alert()`, with no way to see progress or stop it.
 */
export default function JobProgress({ job, onCancel }) {
  if (!job) return null;

  const done = job.completed + job.failed;
  const pct = job.total > 0 ? Math.round((done / job.total) * 100) : 0;
  const finished = isJobFinished(job.status);

  const label = {
    queued: 'Queued…',
    running: job.current ? `Reviewing #${job.current}…` : 'Running…',
    done: 'Complete',
    completed_with_errors: 'Finished with errors',
    cancelled: 'Cancelled',
    failed: 'Failed',
  }[job.status] || job.status;

  return (
    <div className={`job-progress job-${job.status}`} role="status" aria-live="polite">
      <div className="job-progress-head">
        <span className="job-label">{label}</span>
        <span className="job-counts">
          {done}/{job.total}
          {job.failed > 0 && <span className="job-failed"> · {job.failed} failed</span>}
        </span>
        {!finished && onCancel && (
          <button className="btn-link-sm danger" onClick={() => onCancel(job.id)}>
            Cancel
          </button>
        )}
      </div>

      <div
        className="job-bar"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="job-bar-fill" style={{ width: `${pct}%` }} />
      </div>

      {job.errors?.length > 0 && (
        <ul className="job-errors">
          {job.errors.slice(0, 3).map((e, i) => (
            <li key={i}>
              {e.pr_number ? `#${e.pr_number}: ` : ''}{e.error}
            </li>
          ))}
          {job.errors.length > 3 && <li>…and {job.errors.length - 3} more</li>}
        </ul>
      )}
    </div>
  );
}
