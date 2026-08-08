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
You are an expert Git Release Manager, DevOps Engineer, and AI Code Reviewer.
A Pull Request has MERGE CONFLICTS with base branch `{base_branch}`.

PR #{pr_number}: {title}
Repo: {repo_name}
PR Head Branch: {head_branch}
Target Base Branch: {base_branch}

Code Diff & Context Excerpt:
{diff_text[:3500]}

Analyze the conflicting files, branch state, and code changes to build an actionable, step-by-step conflict resolution guide.
Group commands into logical major steps (e.g., Fetching & Checkout, Rebase/Cherry-pick Initiation, Overlapping File Conflict Resolution, Verification & Force Push).
Provide a clear technical explanation for EACH step group.

Respond ONLY with a valid JSON object matching this exact structure:
{{
  "conflict_cause": "Detailed explanation of why merge conflicts occurred between base branch changes and PR branch changes.",
  "recommended_strategy": "High-level merging strategy (e.g. Rebase feature branch onto main while preserving incoming post generation hooks).",
  "resolution_steps": [
    {{
      "step_number": 1,
      "title": "Step 1: Sync Base Branch & Prepare Local PR Branch",
      "explanation": "Fetch the latest remote commits from origin/main and checkout your local feature branch to ensure a clean starting state.",
      "commands": [
        "git fetch origin",
        "git checkout {head_branch}",
        "git pull origin {head_branch}"
      ]
    }},
    {{
      "step_number": 2,
      "title": "Step 2: Initiate Rebase onto Base Branch",
      "explanation": "Rebase your PR commits on top of origin/{base_branch} to replay feature changes over recent main branch updates.",
      "commands": [
        "git rebase origin/{base_branch}"
      ]
    }},
    {{
      "step_number": 3,
      "title": "Step 3: Resolve Overlapping File Conflicts & Stage Fixes",
      "explanation": "Open conflicting files in your editor, remove <<<<<<< and >>>>>>> markers, merge incoming logic, and stage resolved files.",
      "commands": [
        "# Edit conflicting files in your IDE",
        "git add .",
        "git rebase --continue"
      ]
    }},
    {{
      "step_number": 4,
      "title": "Step 4: Verify Syntax & Force Push Update",
      "explanation": "Run syntax validation checks to verify clean code execution before updating the remote pull request branch.",
      "commands": [
        "git status",
        "git push --force-with-lease origin {head_branch}"
      ]
    }}
  ],
  "terminal_commands": [
    "git fetch origin",
    "git checkout {head_branch}",
    "git rebase origin/{base_branch}",
    "git add .",
    "git rebase --continue",
    "git push --force-with-lease origin {head_branch}"
  ],
  "resolved_code_preview": "// 3-way clean resolved code snippet preview\\nfunction example() {{\\n  // Unified resolved logic\\n}}"
}}
"""
        try:
            res = AIService._call_openai(prompt) if AIService._call_openai else None
            if not res or not isinstance(res, dict) or "conflict_cause" not in res:
                res = AIService._call_gemini(prompt)
            return res
        except Exception:
            return ConflictResolutionService._heuristic_conflict_fallback(pr_number, head_branch, base_branch, title)

    @staticmethod
    def _heuristic_conflict_fallback(pr_number: int, head_branch: str, base_branch: str, title: str) -> dict:
        return {
            "conflict_cause": f"PR #{pr_number} ({title}) has branch divergence against base branch `{base_branch}`. Recent commits to `{base_branch}` touched overlapping files or function signatures.",
            "recommended_strategy": f"Perform a local git rebase of PR branch '{head_branch}' onto updated origin/{base_branch}, manually resolving conflict markers in affected files.",
            "resolution_steps": [
                {
                    "step_number": 1,
                    "title": "Step 1: Sync Remote Repositories & Checkout Feature Branch",
                    "explanation": f"Fetch latest remote branch refs from origin and ensure your local branch '{head_branch}' is up-to-date.",
                    "commands": [
                        "git fetch origin",
                        f"git checkout {head_branch}",
                        f"git pull origin {head_branch}"
                    ]
                },
                {
                    "step_number": 2,
                    "title": "Step 2: Start Interactive Rebase onto Main Base Branch",
                    "explanation": f"Rebase PR commits on top of origin/{base_branch} to replay feature changes over latest main commits.",
                    "commands": [
                        f"git rebase origin/{base_branch}"
                    ]
                },
                {
                    "step_number": 3,
                    "title": "Step 3: Resolve Code Conflicts in Affected Files",
                    "explanation": "Inspect files flagged with conflict markers, accept incoming feature changes while conforming to updated core interfaces, then stage files.",
                    "commands": [
                        "# Open editor to resolve <<<<<<< and >>>>>>> markers in files",
                        "git add .",
                        "git rebase --continue"
                    ]
                },
                {
                    "step_number": 4,
                    "title": "Step 4: Verify Syntax & Safely Force Push to Branch",
                    "explanation": "Verify code compilation and execute force-with-lease push to update the open PR on GitHub safely.",
                    "commands": [
                        "git status",
                        f"git push --force-with-lease origin {head_branch}"
                    ]
                }
            ],
            "terminal_commands": [
                "git fetch origin",
                f"git checkout {head_branch}",
                f"git rebase origin/{base_branch}",
                "git add .",
                "git rebase --continue",
                f"git push --force-with-lease origin {head_branch}"
            ],
            "resolved_code_preview": f"// 3-way conflict resolution preview for PR #{pr_number}\n// Merged base branch changes with feature modifications from branch '{head_branch}'"
        }

    @staticmethod
    def generate_bash_script(pr_number: int, conflict_info: dict) -> str:
        cause = conflict_info.get("conflict_cause", "Merge conflict resolution patch.")
        strategy = conflict_info.get("recommended_strategy", "Unified resolution strategy.")
        steps = conflict_info.get("resolution_steps", [])

        lines = [
            "#!/usr/bin/env bash",
            "# ========================================================",
            f"# AI Conflict Resolution Script for PR #{pr_number}",
            "# Generated by PR Intelligence Application",
            "# ========================================================",
            "set -e # Exit immediately on command failure",
            "",
            f'echo "=== Starting Conflict Resolution Execution for PR #{pr_number} ==="',
            f'echo "Strategy: {strategy}"',
            ""
        ]

        if steps:
            for s in steps:
                step_num = s.get("step_number", "")
                title = s.get("title", f"Step {step_num}")
                exp = s.get("explanation", "")
                lines.append(f'echo ""')
                lines.append(f'echo "========================================================"')
                lines.append(f'echo "➜ {title}"')
                if exp:
                    # Sanitize quotes for echo
                    clean_exp = exp.replace('"', '\\"')
                    lines.append(f'echo "   Explanation: {clean_exp}"')
                lines.append(f'echo "========================================================"')
                
                for cmd in s.get("commands", []):
                    if cmd.startswith("#"):
                        clean_c = cmd.replace('"', '\\"')
                        lines.append(f'echo "   {clean_c}"')
                    else:
                        clean_c = cmd.replace('"', '\\"')
                        lines.append(f'echo ">> Executing: {clean_c}"')
                        lines.append(cmd)
        else:
            cmds = conflict_info.get("terminal_commands", [])
            for c in cmds:
                if c.startswith("#"):
                    clean_c = c.replace('"', '\\"')
                    lines.append(f'echo "   {clean_c}"')
                else:
                    clean_c = c.replace('"', '\\"')
                    lines.append(f'echo ">> Executing: {clean_c}"')
                    lines.append(c)

        lines.append("")
        lines.append(f'echo "=== Conflict Resolution Script Execution Complete for PR #{pr_number}! ==="')
        return "\n".join(lines)

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
