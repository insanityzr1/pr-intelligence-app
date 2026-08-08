import re

class DiffParser:
    @staticmethod
    def prepare_diff_context(raw_diff: str, max_lines: int = 400) -> str:
        if not raw_diff:
            return "No diff available."
        
        lines = raw_diff.splitlines()
        if len(lines) <= max_lines:
            return raw_diff
        
        # Tiered diff chunking for large PRs
        summary_chunks = []
        current_file = None
        file_change_count = {}
        
        for line in lines:
            if line.startswith("diff --git"):
                match = re.search(r'b/(.+)$', line)
                current_file = match.group(1) if match else line
                file_change_count[current_file] = 0
            elif current_file and (line.startswith("+") or line.startswith("-")) and not line.startswith("+++") and not line.startswith("---"):
                file_change_count[current_file] += 1

        summary_chunks.append("### Large PR Diff Summary (Chunked Context)")
        summary_chunks.append(f"Total lines in full diff: {len(lines)}")
        summary_chunks.append("Files modified & change counts:")
        for fname, count in list(file_change_count.items())[:30]:
            summary_chunks.append(f"  - `{fname}` ({count} modified lines)")
            
        summary_chunks.append("\nExcerpt of initial diff (first 250 lines):")
        summary_chunks.extend(lines[:250])
        summary_chunks.append("\n[... Remaining diff truncated for LLM token optimization ...]")
        
        return "\n".join(summary_chunks)
