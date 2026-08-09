/**
 * Canonical PR field selectors.
 *
 * The PR payload shape is defined by the backend (see backend/services/github_service.py
 * `fetch_prs`). Several components had drifted onto invented field names
 * (`conflicts_count`, `risk_level`, `pr_number`) that the payload never carries, which
 * silently pinned their counters to zero. Everything that needs to ask "is this PR
 * conflicting / high risk / mergeable" should go through these helpers.
 */

export const isConflicting = (pr) => pr?.mergeable === 'CONFLICTING';
export const isMergeable = (pr) => pr?.mergeable === 'MERGEABLE';
export const isHighRisk = (pr) => pr?.risk === 'High';
export const isAiAnalyzed = (pr) => Boolean(pr?.ai_review);

/** A PR is "clean" when it merges without conflict and carries low risk. */
export const isClean = (pr) => isMergeable(pr) && pr?.risk === 'Low';

/** The PR number. The payload uses `number`; group/tag rows use `pr_number`. */
export const prNumberOf = (pr) => pr?.number ?? pr?.pr_number;

/**
 * Composite identity for a PR. A PR number alone is not unique once more than one
 * repository is configured, so anything that keys, selects, or matches PRs must use
 * this. Matches the `{repo_name}#{pr_number}` form the backend already uses for the
 * /api/tags map and the `prs` cache_key.
 */
export const refKey = (prNumber, repoName) => `${repoName}#${prNumber}`;

/** Composite key for a PR payload object. */
export const prRefKey = (pr) => refKey(prNumberOf(pr), pr?.repo_name);

/** Composite key for a group/tag row, which carries `pr_number` + `repo_name`. */
export const itemRefKey = (item) => refKey(item?.pr_number, item?.repo_name);

/** Key used by the /api/tags map (see database.get_all_pr_tags_map). */
export const tagKeyOf = prRefKey;

/** Head/base branch names as delivered by `gh pr list --json`. */
export const headBranchOf = (pr) => pr?.headRefName || '';
export const baseBranchOf = (pr) => pr?.baseRefName || '';

/**
 * Match a group/workspace item to a PR. Items are keyed by (pr_number, repo_name),
 * so matching on the number alone collides across repositories.
 */
export function matchesItem(pr, item) {
  if (!pr || !item) return false;
  if (prNumberOf(pr) !== item.pr_number) return false;
  if (item.repo_name && pr.repo_name) return pr.repo_name === item.repo_name;
  return true;
}

export function computePrStats(prs = []) {
  return {
    total: prs.length,
    mergeable: prs.filter(isMergeable).length,
    conflicts: prs.filter(isConflicting).length,
    highRisk: prs.filter(isHighRisk).length,
    aiAnalyzed: prs.filter(isAiAnalyzed).length,
    clean: prs.filter(isClean).length,
  };
}
