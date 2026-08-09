import csv
import io
import json
from typing import Optional
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from routers.prs import _prs_cache, _populate_memory_cache_from_db

router = APIRouter(prefix="/api/export", tags=["Export"])

COLUMNS = [
    ("id_str", "PR ID"),
    ("repo_name", "Repository"),
    ("updated_rel", "Last Updated"),
    ("created_fmt", "Created Date"),
    ("title", "Title"),
    ("status", "Status"),
    ("summary", "Summary"),
    ("type", "Type"),
    ("subtype", "Subtype"),
    ("current_status", "Current Status"),
    ("risk_detail", "Risk"),
    ("mergeable", "Mergeable"),
    ("headRefName", "Head Branch"),
    ("baseRefName", "Base Branch"),
    ("rec_action", "Recommended Action"),
    ("url", "URL"),
]


def _select_prs(
    repo_name: Optional[str] = None,
    status: Optional[str] = None,
    pr_type: Optional[str] = None,
    subtype: Optional[str] = None,
    risk: Optional[str] = None,
    mergeable: Optional[str] = None,
    search: Optional[str] = None,
):
    """
    Apply the same filters the matrix UI exposes. The export previously ignored
    every filter and dumped all repositories, while still serving the result as
    `filtered_prs.csv`.
    """
    _populate_memory_cache_from_db()
    rows = list(_prs_cache.values())

    if repo_name:
        rows = [p for p in rows if p.get("repo_name") == repo_name]
    if status:
        rows = [p for p in rows if p.get("status") == status]
    if pr_type:
        rows = [p for p in rows if p.get("type") == pr_type]
    if subtype:
        rows = [p for p in rows if p.get("subtype") == subtype]
    if risk:
        rows = [p for p in rows if p.get("risk") == risk]
    if mergeable:
        rows = [p for p in rows if p.get("mergeable") == mergeable]
    if search:
        q = search.lower()
        rows = [
            p for p in rows
            if q in str(p.get("title", "")).lower()
            or q in str(p.get("author", "")).lower()
            or q in str(p.get("summary", "")).lower()
            or q in str(p.get("number", ""))
        ]

    rows.sort(key=lambda p: p.get("updated_at") or "", reverse=True)
    return rows


@router.get("/csv")
def export_csv(
    repo_name: Optional[str] = None,
    status: Optional[str] = None,
    pr_type: Optional[str] = None,
    subtype: Optional[str] = None,
    risk: Optional[str] = None,
    mergeable: Optional[str] = None,
    search: Optional[str] = None,
):
    rows = _select_prs(repo_name, status, pr_type, subtype, risk, mergeable, search)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([label for _key, label in COLUMNS])
    for pr in rows:
        writer.writerow([pr.get(key, "") for key, _label in COLUMNS])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=filtered_prs.csv"},
    )


@router.get("/json")
def export_json(
    repo_name: Optional[str] = None,
    status: Optional[str] = None,
    pr_type: Optional[str] = None,
    subtype: Optional[str] = None,
    risk: Optional[str] = None,
    mergeable: Optional[str] = None,
    search: Optional[str] = None,
):
    rows = _select_prs(repo_name, status, pr_type, subtype, risk, mergeable, search)
    payload = json.dumps({"count": len(rows), "prs": rows}, indent=2)
    return StreamingResponse(
        iter([payload]),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=filtered_prs.json"},
    )


@router.get("/markdown")
def export_markdown(
    repo_name: Optional[str] = None,
    status: Optional[str] = None,
    pr_type: Optional[str] = None,
    subtype: Optional[str] = None,
    risk: Optional[str] = None,
    mergeable: Optional[str] = None,
    search: Optional[str] = None,
):
    rows = _select_prs(repo_name, status, pr_type, subtype, risk, mergeable, search)

    lines = ["| PR | Title | Author | Status | Risk | Mergeable |", "| --- | --- | --- | --- | --- | --- |"]
    for pr in rows:
        title = str(pr.get("title", "")).replace("|", "\\|")
        lines.append(
            f"| [#{pr.get('number')}]({pr.get('url')}) | {title} | @{pr.get('author')} "
            f"| {pr.get('status')} | {pr.get('risk')} | {pr.get('mergeable')} |"
        )

    body = f"# Pull Requests ({len(rows)})\n\n" + "\n".join(lines) + "\n"
    return StreamingResponse(
        iter([body]),
        media_type="text/markdown",
        headers={"Content-Disposition": "attachment; filename=filtered_prs.md"},
    )
