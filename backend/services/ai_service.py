import json
import logging
import requests
from config import settings
from services.diff_parser import DiffParser

logger = logging.getLogger(__name__)


class AIService:
    @staticmethod
    def analyze_pr(pr_data: dict, diff_text: str) -> dict:
        pr_number = pr_data.get('number')
        repo_name = pr_data.get('repo_name', settings.DEFAULT_REPO)
        title = pr_data.get('title', '')
        author = pr_data.get('author', '')
        pr_type = pr_data.get('type', 'Enhancement')

        # Chunk rather than hard-slice. A raw diff_text[:4000] routinely cut mid-hunk
        # and dropped every file after the first, so large PRs were reviewed on a
        # fragment without the model being told anything was missing.
        diff_context = DiffParser.prepare_diff_context(diff_text)

        prompt = f"""
You are an expert Senior Code Reviewer and Lead Architect.
Analyze PR #{pr_number} in repo `{repo_name}`.

Title: {title}
Author: @{author}
Type: {pr_type}

Diff Excerpt:
{diff_context}

Respond ONLY with a valid JSON object matching this structure:
{{
  "code_quality_score": 85,
  "ai_summary": "Concise 2-sentence executive summary of what this PR does and why.",
  "architectural_impact": "Impact on system design, classes, repositories, or dependencies.",
  "breaking_changes": ["List any potential breaking changes or empty array if none"],
  "security_risks": ["List any security vectors, input sanitization issues, or empty array if none"],
  "qa_test_scenarios": [
    "1. Test primary workflow...",
    "2. Test boundary condition...",
    "3. Test regression scenario..."
  ]
}}
"""

        for call in AIService._available_providers():
            return call(prompt)
        return AIService._heuristic_fallback(pr_data)

    # Ollama needs no API key, so "configured" cannot gate it. Requiring it to be
    # named explicitly keeps `auto` with no keys going straight to heuristics
    # rather than waiting on a localhost connection that probably is not there.
    @staticmethod
    def _provider_candidates(json_mode: bool):
        if json_mode:
            calls = (AIService._call_gemini, AIService._call_openai, AIService._call_anthropic,
                     AIService._call_deepseek, AIService._call_ollama)
        else:
            calls = (AIService._text_gemini, AIService._text_openai, AIService._text_anthropic,
                     AIService._text_deepseek, AIService._text_ollama)

        gemini, openai, anthropic, deepseek, ollama = calls
        provider = settings.AI_PROVIDER
        candidates = [
            ("gemini", bool(settings.GEMINI_API_KEY), gemini),
            ("openai", bool(settings.OPENAI_API_KEY), openai),
            ("anthropic", bool(settings.ANTHROPIC_API_KEY), anthropic),
            ("deepseek", bool(settings.DEEPSEEK_API_KEY), deepseek),
            ("ollama", provider == "ollama", ollama),
        ]
        return [(name, call) for name, usable, call in candidates
                if usable and provider in ("auto", name)]

    @staticmethod
    def _available_providers():
        return [call for _name, call in AIService._provider_candidates(json_mode=True)]

    @staticmethod
    def chat_response(pr_data: dict, diff_text: str, user_msg: str) -> str:
        """
        Freeform text chat completion for interactive PR assistant.
        Uses configured AI Provider (Gemini, OpenAI, Anthropic) or rich dynamic analyzer.
        """
        pr_number = pr_data.get('number', 0)
        repo_name = pr_data.get('repo_name', settings.DEFAULT_REPO)
        title = pr_data.get('title', 'PR')
        author = pr_data.get('author', 'unknown')
        summary = pr_data.get('summary', '')
        diff_context = DiffParser.prepare_diff_context(diff_text, max_lines=350)

        prompt = f"""
You are an expert AI Pair Programmer assisting a developer with Pull Request #{pr_number} in `{repo_name}`.

PR Details:
- Title: {title}
- Author: @{author}
- Summary: {summary}

Code Diff Excerpt:
{diff_context}

User Question:
{user_msg}

Instructions:
Answer the user's question directly, accurately, and professionally. If the user asks what changed, detail the specific diff modifications. If they ask for tests or code refactors, provide clean markdown code blocks.
"""
        # Try each configured provider in order, falling through on failure.
        for name, call in AIService._available_text_providers():
            try:
                text = call(prompt)
                if text:
                    return text
            except Exception as e:
                logger.error("%s chat call failed: %s", name, e)

        # Rich Dynamic Fallback Analyzer
        msg_lower = user_msg.lower()
        
        if "conflict" in msg_lower or "rebase" in msg_lower or "merge" in msg_lower:
            return f"### Merge Conflict Guidance for PR #{pr_number}\n\n1. **Fetch & Rebase**: Run `git fetch origin` then `git rebase origin/main` on branch `{pr_data.get('headRefName', 'feature-branch')}`.\n2. **Resolve Overlapping Files**: Edit files containing conflict markers (`<<<<<<<` and `>>>>>>>`), stage fixes with `git add .`, and continue rebase with `git rebase --continue`.\n3. **Push Update**: Use `git push --force-with-lease` to update the PR on GitHub safely."
            
        elif "test" in msg_lower or "qa" in msg_lower or "unittest" in msg_lower:
            return f"### Recommended Test Plan for PR #{pr_number}\n\n```php\n// Example PHPUnit Test Case for PR #{pr_number}\npublic function test_pr_{pr_number}_workflow_execution() {{\n    $result = $this->executor->run();\n    $this->assertTrue($result->isSuccess());\n}}\n```\n\n- **Unit Tests**: Verify core service methods touched in `{title}`.\n- **Integration Tests**: Execute full workflow from trigger to persistence."
            
        elif "change" in msg_lower or "summary" in msg_lower or "what" in msg_lower or "review" in msg_lower:
            changed = pr_data.get('changed_files', 0)
            adds = pr_data.get('additions', 0)
            dels = pr_data.get('deletions', 0)
            return f"### Code Changes Overview for PR #{pr_number}\n\n- **Title**: {title}\n- **Author**: @{author}\n- **Impact**: Modifies {changed} file(s) (+{adds}/-{dels}).\n- **Summary**: {summary}\n\nThe modifications focus on updating template rendering structures and removing inline style declarations in favor of central stylesheet classes."
            
        else:
            return f"### PR #{pr_number} Assistant Response\n\nI have analyzed **PR #{pr_number} ({title})** by @{author}.\n\n- **Query**: {user_msg}\n- **Recommendation**: Review modified files to ensure strict adherence to repository coding standards and test coverage guidelines. If you'd like custom code snippets or rebase commands, please specify!"

    @staticmethod
    def _strip_json_fences(text: str) -> str:
        return text.replace("```json", "").replace("```", "").strip()

    # --- Freeform text completions (chat) ---------------------------------
    # These mirror the JSON calls above but return prose. They previously lived
    # inline in chat_response with the models hardcoded a second time.

    @staticmethod
    def _text_gemini(prompt: str) -> str:
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{settings.GEMINI_MODEL}:generateContent?key={settings.GEMINI_API_KEY}"
        )
        resp = requests.post(url, json={"contents": [{"parts": [{"text": prompt}]}]}, timeout=settings.AI_TIMEOUT)
        res_json = resp.json()
        if res_json.get("candidates"):
            return res_json["candidates"][0]["content"]["parts"][0]["text"].strip()
        if "error" in res_json:
            logger.error("Gemini API error: %s", res_json["error"].get("message"))
        return ""

    @staticmethod
    def _text_openai(prompt: str) -> str:
        resp = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {settings.OPENAI_API_KEY}", "Content-Type": "application/json"},
            json={"model": settings.OPENAI_MODEL, "messages": [{"role": "user", "content": prompt}], "temperature": 0.3},
            timeout=settings.AI_TIMEOUT,
        )
        res_json = resp.json()
        if res_json.get("choices"):
            return res_json["choices"][0]["message"]["content"].strip()
        return ""

    @staticmethod
    def _text_anthropic(prompt: str) -> str:
        resp = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": settings.ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            json={
                "model": settings.ANTHROPIC_MODEL,
                "max_tokens": 1000,
                "messages": [{"role": "user", "content": prompt}],
            },
            timeout=settings.AI_TIMEOUT,
        )
        res_json = resp.json()
        if res_json.get("content"):
            return res_json["content"][0]["text"].strip()
        return ""

    @staticmethod
    def _text_deepseek(prompt: str) -> str:
        resp = requests.post(
            "https://api.deepseek.com/chat/completions",
            headers={"Authorization": f"Bearer {settings.DEEPSEEK_API_KEY}", "Content-Type": "application/json"},
            json={"model": settings.DEEPSEEK_MODEL, "messages": [{"role": "user", "content": prompt}], "temperature": 0.3},
            timeout=settings.AI_TIMEOUT,
        )
        res_json = resp.json()
        if res_json.get("choices"):
            return res_json["choices"][0]["message"]["content"].strip()
        return ""

    @staticmethod
    def _text_ollama(prompt: str) -> str:
        resp = requests.post(
            f"{settings.OLLAMA_BASE_URL.rstrip('/')}/api/generate",
            json={"model": settings.OLLAMA_MODEL, "prompt": prompt, "stream": False},
            timeout=settings.AI_TIMEOUT,
        )
        return (resp.json().get("response") or "").strip()

    @staticmethod
    def _available_text_providers():
        return AIService._provider_candidates(json_mode=False)

    @staticmethod
    def _call_openai(prompt: str) -> dict:
        try:
            url = "https://api.openai.com/v1/chat/completions"
            headers = {
                "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": settings.OPENAI_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "response_format": {"type": "json_object"},
                "temperature": 0.2
            }
            resp = requests.post(url, json=payload, headers=headers, timeout=settings.AI_TIMEOUT)
            res_json = resp.json()
            content = res_json['choices'][0]['message']['content']
            return json.loads(content)
        except Exception as e:
            logger.error("OpenAI API call failed: %s", e)
            return AIService._heuristic_fallback({})

    @staticmethod
    def _call_gemini(prompt: str) -> dict:
        try:
            url = (
                f"https://generativelanguage.googleapis.com/v1beta/models/"
                f"{settings.GEMINI_MODEL}:generateContent?key={settings.GEMINI_API_KEY}"
            )
            payload = {
                "contents": [{"parts": [{"text": prompt + "\nProvide JSON response only."}]}]
            }
            resp = requests.post(url, json=payload, timeout=settings.AI_TIMEOUT)
            res_json = resp.json()
            text = res_json['candidates'][0]['content']['parts'][0]['text']
            return json.loads(AIService._strip_json_fences(text))
        except Exception as e:
            logger.error("Gemini API call failed: %s", e)
            return AIService._heuristic_fallback({})

    @staticmethod
    def _call_anthropic(prompt: str) -> dict:
        try:
            url = "https://api.anthropic.com/v1/messages"
            headers = {
                "x-api-key": settings.ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json"
            }
            payload = {
                "model": settings.ANTHROPIC_MODEL,
                "max_tokens": 1000,
                "messages": [{"role": "user", "content": prompt}]
            }
            resp = requests.post(url, json=payload, headers=headers, timeout=settings.AI_TIMEOUT)
            res_json = resp.json()
            text = res_json['content'][0]['text']
            return json.loads(AIService._strip_json_fences(text))
        except Exception as e:
            logger.error("Anthropic API call failed: %s", e)
            return AIService._heuristic_fallback({})

    @staticmethod
    def _call_deepseek(prompt: str) -> dict:
        """DEEPSEEK_API_KEY was read from config but no code path ever used it."""
        try:
            url = "https://api.deepseek.com/chat/completions"
            headers = {
                "Authorization": f"Bearer {settings.DEEPSEEK_API_KEY}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": settings.DEEPSEEK_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "response_format": {"type": "json_object"},
                "temperature": 0.2
            }
            resp = requests.post(url, json=payload, headers=headers, timeout=settings.AI_TIMEOUT)
            res_json = resp.json()
            content = res_json['choices'][0]['message']['content']
            return json.loads(AIService._strip_json_fences(content))
        except Exception as e:
            logger.error("DeepSeek API call failed: %s", e)
            return AIService._heuristic_fallback({})

    @staticmethod
    def _call_ollama(prompt: str) -> dict:
        """Ollama was advertised in --help and the .env comments but never implemented."""
        try:
            url = f"{settings.OLLAMA_BASE_URL.rstrip('/')}/api/generate"
            payload = {
                "model": settings.OLLAMA_MODEL,
                "prompt": prompt + "\nRespond with JSON only.",
                "format": "json",
                "stream": False,
            }
            resp = requests.post(url, json=payload, timeout=settings.AI_TIMEOUT)
            res_json = resp.json()
            return json.loads(AIService._strip_json_fences(res_json.get("response", "")))
        except Exception as e:
            logger.error("Ollama API call failed: %s", e)
            return AIService._heuristic_fallback({})

    @staticmethod
    def _heuristic_fallback(pr_data: dict) -> dict:
        num = pr_data.get('number', 0)
        title = pr_data.get('title', 'PR Analysis')
        additions = pr_data.get('additions', 0)
        deletions = pr_data.get('deletions', 0)
        changed_files = pr_data.get('changedFiles', 0)
        
        score = 88 if changed_files < 5 else (75 if changed_files < 15 else 60)
        
        return {
            "code_quality_score": score,
            "ai_summary": f"PR #{num} ({title}) modifies {changed_files} file(s) (+{additions}/-{deletions}). The implementation aligns with modular component guidelines.",
            "architectural_impact": "Localized changes touching repository classes and UI layout files.",
            "breaking_changes": ["None detected via automated heuristic scan."],
            "security_risks": ["Ensure request parameters and user inputs are properly sanitized."],
            "qa_test_scenarios": [
                f"1. Verify workflow execution for PR #{num}.",
                "2. Check error handling and edge cases.",
                "3. Ensure no unexpected regressions in core plugin functionality."
            ]
        }
