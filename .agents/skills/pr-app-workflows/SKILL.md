---
name: pr-app-workflows
description: Development workflow instructions and cheatsheet for PR Intelligence App tasks including backend routes, React components, database updates, and testing verification.
---

# PR App Agent Workflows & Cheatsheet

Use this skill when developing, debugging, refactoring, or extending features in `pr-intelligence-app`.

## 1. Adding a New FastAPI Backend Route

1. Define request/response Pydantic models in `backend/models.py`.
2. Add database query helpers in `backend/database.py`.
3. Create or update router file in `backend/routers/<feature>.py`.
4. Ensure router is registered in `backend/main.py`:
   ```python
   from routers import <feature>
   app.include_router(<feature>.router, prefix="/api")
   ```
5. Add unit/integration tests in `backend/tests/test_routers.py`.

## 2. Adding a New Frontend React Feature

1. Add backend API request wrapper in `frontend/src/api/client.js`.
2. Create or update component in `frontend/src/components/<Component>.jsx`.
3. Apply dark glassmorphic styles in `frontend/src/App.css`.
4. Add component unit/feature tests in `frontend/src/__tests__/<Component>.test.jsx`.

## 3. Running Verification & Diagnostics

Always run the full test suite before completing a task:

```bash
# Unified Test Suite Runner (Runs Pytest + Vitest)
python run_tests.py
```

To run individual test commands:
```bash
# Pytest Backend
python -m pytest backend/tests -v

# Vitest Frontend
cd frontend && npm test
```
