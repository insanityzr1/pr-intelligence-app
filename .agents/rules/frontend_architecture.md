# Frontend Architecture & UI Design System Rules

## React 18 & Component Structure
- All user interface elements reside in `frontend/src/components/`.
- Keep components focused and single-purpose:
  - `PRMatrix.jsx`: Main table matrix view with searching, filtering, and tag badges.
  - `PRDetailDrawer.jsx`: Centered 1240px wide modal drawer with overview grid and AI chat tab.
  - `ReleaseBuilder.jsx`: Typeahead search, PR selection, changelog drafting, and saved changelogs sidebar.
  - `StagingWorkspacesTab.jsx`: Staging buckets workspace view for batch AI reviews.
  - `PRTagBar.jsx`: Quick predefined tags and custom tag creation component.
  - `FormattedMarkdown.jsx`: Custom markdown parser and typography renderer.
  - `RepoManagerModal.jsx`: Modal for managing active GitHub repositories.

## API Client Layer
- All HTTP requests to the FastAPI backend must be placed in `frontend/src/api/client.js`.
- Components should never invoke `fetch()` directly; import helper functions from `api/client.js`.
- Always handle errors and return safe defaults (e.g. empty array `[]` or null) to prevent UI crashes.

## Design System & Styling
- Pure CSS styling defined in `frontend/src/App.css` using HSL color tokens and CSS variables.
- Palette:
  - Dark background: `--bg-color: #0f172a`
  - Cards: `--card-bg: #1e293b`
  - Accents: `--accent-color: #6366f1` (Indigo/Purple)
  - Risk Badges: Low (`#4ade80`), Medium (`#facc15`), High (`#f87171`).
- Avoid adding inline styles for colors; reference existing CSS utility classes and design tokens.
