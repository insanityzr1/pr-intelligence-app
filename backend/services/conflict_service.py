import logging
from typing import List, Dict
from services.github_service import GitHubService, GitHubServiceError

logger = logging.getLogger(__name__)

class ConflictService:
    @staticmethod
    def detect_file_collisions(prs: List[Dict]) -> Dict:
        file_to_prs = {}
        skipped = []

        for pr in prs:
            pr_num = pr['number']
            try:
                files = GitHubService.fetch_pr_files(pr_num, pr.get('repo_name'))
            except GitHubServiceError as exc:
                # One unreachable PR must not blank out the whole collision map,
                # but it also must not silently look like "no collisions".
                logger.warning("Skipping PR #%s in collision scan: %s", pr_num, exc)
                skipped.append({"pr_number": pr_num, "repo_name": pr.get('repo_name'), "reason": str(exc)})
                continue

            for f in files:
                if f not in file_to_prs:
                    file_to_prs[f] = []
                file_to_prs[f].append({
                    "pr_number": pr_num,
                    "repo_name": pr.get('repo_name'),
                    "title": pr.get('title', f"PR #{pr_num}"),
                    "author": pr.get('author', 'unknown'),
                    "url": pr.get('url')
                })

        collisions = []
        for filepath, pr_list in file_to_prs.items():
            if len(pr_list) > 1:
                collisions.append({
                    "filepath": filepath,
                    "overlapping_prs_count": len(pr_list),
                    "prs": pr_list,
                    "severity": "HIGH" if len(pr_list) > 2 else "MEDIUM"
                })

        collisions.sort(key=lambda x: x['overlapping_prs_count'], reverse=True)
        return {"collisions": collisions, "skipped": skipped}
