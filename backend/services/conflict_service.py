from typing import List, Dict
from services.github_service import GitHubService

class ConflictService:
    @staticmethod
    def detect_file_collisions(prs: List[Dict]) -> List[Dict]:
        file_to_prs = {}
        
        for pr in prs:
            pr_num = pr['number']
            files = GitHubService.fetch_pr_files(pr_num)
            for f in files:
                if f not in file_to_prs:
                    file_to_prs[f] = []
                file_to_prs[f].append({
                    "pr_number": pr_num,
                    "title": pr['title'],
                    "author": pr['author'],
                    "url": pr['url']
                })

        # Filter files touched by > 1 PR
        collisions = []
        for file_path, pr_list in file_to_prs.items():
            if len(pr_list) > 1:
                collisions.append({
                    "file_path": file_path,
                    "conflicting_count": len(pr_list),
                    "prs": pr_list
                })

        collisions.sort(key=lambda x: x['conflicting_count'], reverse=True)
        return collisions
