from typing import List, Dict

class ChangelogService:
    @staticmethod
    def generate_changelog(selected_prs: List[Dict]) -> Dict:
        categories = {
            "🚀 New Features": [],
            "⚡ Improvements & Enhancements": [],
            "🛠️ Refactoring & Architecture": [],
            "🐛 Bug Fixes": [],
            "🧪 Testing & Infrastructure": []
        }
        
        for pr in selected_prs:
            pr_type = pr.get('type', '')
            subtype = pr.get('subtype', '')
            title = pr.get('title', '')
            num = pr.get('number')
            url = pr.get('url')
            
            entry = f"- [#{num}]({url}) {title}"
            
            if "Bug" in subtype or "Fix" in pr_type:
                categories["🐛 Bug Fixes"].append(entry)
            elif "New Feature" in pr_type:
                categories["🚀 New Features"].append(entry)
            elif "Refactor" in pr_type:
                categories["🛠️ Refactoring & Architecture"].append(entry)
            elif "Testing" in pr_type or "Infrastructure" in pr_type:
                categories["🧪 Testing & Infrastructure"].append(entry)
            else:
                categories["⚡ Improvements & Enhancements"].append(entry)
                
        # Build markdown release text
        md_lines = ["# Release Notes & Feature Changelog\n"]
        for cat, items in categories.items():
            if items:
                md_lines.append(f"### {cat}")
                md_lines.extend(items)
                md_lines.append("")
                
        return {
            "markdown": "\n".join(md_lines),
            "total_prs": len(selected_prs),
            "categories": {k: len(v) for k, v in categories.items() if v}
        }
