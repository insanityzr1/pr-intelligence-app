import csv
import io
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from routers.prs import _prs_cache

router = APIRouter(prefix="/api/export", tags=["Export"])

@router.get("/csv")
def export_csv():
    output = io.StringIO()
    writer = csv.writer(output)
    
    writer.writerow(["PR ID", "Last Updated", "Created Date", "Title", "Status", "Summary", "Type", "Subtype", "Current Status", "Risk", "Recommended Action", "URL"])
    
    for pr in _prs_cache.values():
        writer.writerow([
            pr.get("id_str"),
            pr.get("updated_rel"),
            pr.get("created_fmt"),
            pr.get("title"),
            pr.get("status"),
            pr.get("summary"),
            pr.get("type"),
            pr.get("subtype"),
            pr.get("current_status"),
            pr.get("risk_detail"),
            pr.get("rec_action"),
            pr.get("url")
        ])
        
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=filtered_prs.csv"}
    )
