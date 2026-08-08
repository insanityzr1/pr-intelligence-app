import json
from services.github_service import GitHubService
from services.ai_service import AIService

class ConflictResolutionService:
    @staticmethod
    def resolve_conflicts(pr_data: dict, diff_text: str) -> dict:
        pr_number = pr_data.get('number')
        repo_name = pr_data.get('repo_name', 'rpnunez/wp-ai-scheduler')
        title = pr_data.get('title', '')
        head_branch = pr_data.get('headRefName', f'branch-pr-{pr_number}')
        base_branch = pr_data.get('baseRefName', 'main')

        prompt = f"""
You are an expert Git Release Manager and Conflict Resolution AI Engineer.
A Pull Request has MERGE CONFLICTS with the base branch `{base_branch}`.

PR #{pr_number}: {title}
Repo: {repo_name}
PR Head Branch: {head_branch}
Target Base Branch: {base_branch}

Code Diff & Context Excerpt:
{diff_text[:3000]}

Analyze the conflicting files and generate a structured JSON conflict resolution guide.
Respond ONLY with a valid JSON object matching this structure:
{{
  "conflict_cause": "Detailed explanation of why merge conflicts occurred between base branch changes and PR branch changes.",
  "recommended_strategy": "High-level merging strategy (e.g. Keep PR additions while merging main's structural refactor).",
  "terminal_commands": [
    "git fetch origin",
    "git checkout {head_branch}",
    "git rebase origin/{base_branch}",
    "# Resolve conflicts in editor",
    "git add .",
    "git rebase --continue",
    "git push --force-with-lease"
  ],
  "resolved_code_preview": "// 3-way clean resolved snippet preview\\nfunction example() {{\\n  // Unified resolved logic\\n}}"
}}
"""
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent"
            # Attempt AI resolution via AIService provider fallback
            res = AIService._call_openai(prompt) if AIService._call_openai else None
            if not res or not isinstance(res, dict) or "conflict_cause" not in res:
                res = AIService._call_gemini(prompt)
            return res
        except Exception:
            return ConflictResolutionService._heuristic_conflict_fallback(pr_number, head_branch, base_branch, title)

    @staticmethod
    def _heuristic_conflict_fallback(pr_number: int, head_branch: str, base_branch: str, title: str) -> dict:
        return {
            "conflict_cause": f"PR #{pr_number} ({title}) has branch divergence against base branch `{base_branch}`. Recent commits to `{base_branch}` touched overlapping files or signatures.",
            "recommended_strategy": "Perform a local git rebase of the PR branch onto updated main, manually accepting both incoming feature logic and updated core interfaces.",
            "terminal_commands": [
                f"git fetch origin",
                f"git checkout {head_branch}",
                f"git rebase origin/{base_branch}",
                f"# Inspect and resolve conflicts in editor",
                f"git add .",
                f"git rebase --continue",
                f"git push --force-with-lease origin {head_branch}"
            ],
            "resolved_code_preview": f"// Rebase preview for PR #{pr_number}\n// Merged base branch changes with feature modifications from branch '{head_branch}'"
        }

    @staticmethod
    def generate_patch(pr_number: int, conflict_info: dict) -> str:
        cause = conflict_info.get("conflict_cause", "Merge conflict resolution patch.")
        strategy = conflict_info.get("recommended_strategy", "Unified resolution strategy.")
        preview = conflict_info.get("resolved_code_preview", "// Clean code preview")
        
        patch_lines = [
            f"# AI Conflict Resolution Patch for PR #{pr_number}",
            f"# Cause: {cause}",
            f"# Strategy: {strategy}",
            "---",
            preview,
            ""
        ]
        return "\n".join(patch_lines)
