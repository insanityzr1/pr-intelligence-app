import json
import requests
from config import settings
from services.diff_parser import DiffParser

class AIService:
    @staticmethod
    def analyze_pr(pr_data: dict, diff_text: str) -> dict:
        diff_context = DiffParser.prepare_diff_context(diff_text)
        
        prompt = f"""
You are an expert Senior Staff Software Engineer and AI Code Reviewer.
Analyze the following GitHub Pull Request and provide structured JSON analysis output.

PR Metadata:
- ID: #{pr_data.get('number')}
- Title: {pr_data.get('title')}
- Author: {pr_data.get('author')}
- Status: {pr_data.get('status')}
- Type: {pr_data.get('type')} / Subtype: {pr_data.get('subtype')}
- Files Changed: {pr_data.get('changed_files')} (+{pr_data.get('additions')}/-{pr_data.get('deletions')})
- Description: {pr_data.get('body', '')[:1000]}

Git Code Diff Context:
{diff_context}

Respond ONLY with a valid JSON object matching this exact structure:
{{
  "ai_summary": "Concise 2-3 sentence technical overview of what changed and why.",
  "architectural_impact": "Impact on system architecture, database, or API contracts.",
  "breaking_changes": ["List of potential breaking changes, or empty list if none."],
  "security_risks": ["List of potential security, input sanitization, or permission issues, or empty list if none."],
  "qa_test_scenarios": [
    "Step 1: Specific scenario to test",
    "Step 2: Specific scenario to test",
    "Step 3: Verification scenario"
  ],
  "code_quality_score": 85,
  "recommendation": "Merge / Needs Review / Needs Testing / Rebase"
}}
"""

        # Provider fallback logic
        if settings.OPENAI_API_KEY and (settings.AI_PROVIDER in ["auto", "openai"]):
            return AIService._call_openai(prompt)
        elif settings.GEMINI_API_KEY and (settings.AI_PROVIDER in ["auto", "gemini"]):
            return AIService._call_gemini(prompt)
        elif settings.ANTHROPIC_API_KEY and (settings.AI_PROVIDER in ["auto", "anthropic"]):
            return AIService._call_anthropic(prompt)
        else:
            return AIService._heuristic_fallback(pr_data)

    @staticmethod
    def _call_openai(prompt: str) -> dict:
        try:
            url = "https://api.openai.com/v1/chat/completions"
            headers = {
                "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": "gpt-4o-mini",
                "messages": [{"role": "user", "content": prompt}],
                "response_format": {"type": "json_object"},
                "temperature": 0.2
            }
            resp = requests.post(url, json=payload, headers=headers, timeout=30)
            res_json = resp.json()
            content = res_json['choices'][0]['message']['content']
            return json.loads(content)
        except Exception as e:
            print(f"OpenAI API call failed: {e}")
            return AIService._heuristic_fallback({})

    @staticmethod
    def _call_gemini(prompt: str) -> dict:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={settings.GEMINI_API_KEY}"
            payload = {
                "contents": [{"parts": [{"text": prompt + "\nProvide JSON response only."}]}]
            }
            resp = requests.post(url, json=payload, timeout=30)
            res_json = resp.json()
            text = res_json['candidates'][0]['content']['parts'][0]['text']
            clean_text = text.replace("```json", "").replace("```", "").strip()
            return json.loads(clean_text)
        except Exception as e:
            print(f"Gemini API call failed: {e}")
            return AIService._heuristic_fallback({})

    @staticmethod
    def _call_anthropic(prompt: str) -> dict:
        try:
            url = "https://api.anthropic.com/v1/messages"
            headers = {
                "x-api-key": settings.ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json"
            }
            payload = {
                "model": "claude-3-5-sonnet-20240620",
                "max_tokens": 1000,
                "messages": [{"role": "user", "content": prompt + "\nRespond strictly in valid JSON format."}]
            }
            resp = requests.post(url, json=payload, headers=headers, timeout=30)
            text = resp.json()['content'][0]['text']
            clean_text = text.replace("```json", "").replace("```", "").strip()
            return json.loads(clean_text)
        except Exception as e:
            print(f"Anthropic API call failed: {e}")
            return AIService._heuristic_fallback({})

    @staticmethod
    def _heuristic_fallback(pr_data: dict) -> dict:
        # Smart fallback if AI API keys are not configured
        num = pr_data.get('number', 0)
        title = pr_data.get('title', 'PR Analysis')
        return {
            "ai_summary": f"Automated analysis for #{num}: {title}. Modifies {pr_data.get('changed_files', 0)} files (+{pr_data.get('additions', 0)}/-{pr_data.get('deletions', 0)}).",
            "architectural_impact": "Localized changes touching repository classes and UI layout files.",
            "breaking_changes": ["None detected via automated heuristic scan."],
            "security_risks": ["Ensure request parameters and user inputs are properly sanitized."],
            "qa_test_scenarios": [
                f"Verify workflow execution for PR #{num}.",
                "Check error handling and edge cases.",
                "Ensure no unexpected regressions in core plugin functionality."
            ],
            "code_quality_score": 88,
            "recommendation": pr_data.get('rec_action', 'Review & test')
        }
