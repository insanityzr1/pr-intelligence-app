# Testing & Verification Rules

## Mandatory Test Verification
Before declaring any task or feature completed, agents MUST run the unified test runner:

```bash
python run_tests.py
```

All backend Pytest tests and frontend Vitest tests must report **100% PASS** state.

## Backend Pytest Conventions
- Test files reside in `backend/tests/`.
- Use the `client` fixture (FastAPI `TestClient`) and `test_db` (isolated temporary SQLite DB) defined in `conftest.py`.
- Add test coverage whenever creating new backend routes, services, or database functions.

## Frontend Vitest Conventions
- Test files reside in `frontend/src/__tests__/`.
- Mock API calls by mocking `frontend/src/api/client.js` with `vi.mock('../api/client')`.
- Use `@testing-library/react` and `fireEvent`/`waitFor` to simulate user actions.
