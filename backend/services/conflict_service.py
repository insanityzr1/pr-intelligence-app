from typing import List, Dict
from services.github_service import GitHubService

class ConflictService:
    @staticmethod
    def detect_file_collisions(prs: List[Dict]) -> List[Dict]:
        file_to_prs = {}
        
        for pr in prs:
            pr_num = pr['number']
            files = GitHubService.fetch_pr_files(pr_num, pr.get('repo_name'))
            for f in files:
                if f not in file_to_prs:
                    file_to_prs[f] = []
                file_to_prs[f].append({
                    "pr_number": pr_num,
                    "title": pr.get('title', f"PR #{pr_num}"),
                    "author": pr.get('author', 'unknown'),
                    "url": pr.get('url', f"https://github.com/rpnunez/wp-ai-scheduler/pull/{pr_num}")
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

        return sorted(collisions, key=lambda x: x['overlapping_prs_count'], reverse=True)
