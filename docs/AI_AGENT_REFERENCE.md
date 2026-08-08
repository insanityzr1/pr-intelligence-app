# 🤖 AI Agent Reference & Architecture Catalog

Comprehensive subsystem inventory, database schema specs, and API endpoint reference for AI agents working on `pr-intelligence-app`.

---

## 🗄️ SQLite Database Catalog (`pr_intelligence.db`)

### `prs` Table
Stores cached PR metadata fetched from GitHub.
- `cache_key`: TEXT PRIMARY KEY (format: `repo_name#pr_number`)
- `pr_number`: INTEGER
- `repo_name`: TEXT
- `pr_data`: TEXT (JSON stringified metadata)
- `updated_at`: TIMESTAMP

### `ai_reviews` Table
Stores generated AI code reviews and quality scores.
- `pr_number`: INTEGER PRIMARY KEY
- `head_sha`: TEXT
- `ai_data`: TEXT (JSON stringified review data)
- `updated_at`: TIMESTAMP

### `pr_chats` Table
Stores persistent AI chat thread history per PR.
- `id`: INTEGER PRIMARY KEY AUTOINCREMENT
- `pr_number`: INTEGER
- `repo_name`: TEXT
- `role`: TEXT ('user' or 'assistant')
- `message`: TEXT
- `created_at`: TIMESTAMP

### `pr_tags` Table
Stores quick and custom tags per PR.
- `pr_number`: INTEGER
- `repo_name`: TEXT
- `tag`: TEXT
- `created_at`: TIMESTAMP
- PRIMARY KEY (`pr_number`, `repo_name`, `tag`)

### `pr_groups` Table
Stores custom workspace staging buckets.
- `group_id`: INTEGER PRIMARY KEY AUTOINCREMENT
- `name`: TEXT
- `description`: TEXT
- `created_at`: TIMESTAMP

### `pr_group_items` Table
Maps PRs to staging groups.
- `group_id`: INTEGER
- `pr_number`: INTEGER
- `repo_name`: TEXT
- PRIMARY KEY (`group_id`, `pr_number`, `repo_name`)

### `changelogs` Table
Stores saved generated release notes.
- `id`: INTEGER PRIMARY KEY AUTOINCREMENT
- `title`: TEXT
- `pr_numbers`: TEXT (JSON stringified array)
- `branches`: TEXT (JSON stringified array)
- `markdown`: TEXT
- `created_at`: TIMESTAMP

---

## 🔌 API Endpoints Catalog

- **`GET /api/prs`**: Fetch list of open pull requests.
- **`POST /api/prs/sync`**: Trigger live sync from GitHub CLI.
- **`GET /api/prs/{id}`**: Fetch detailed PR view with AI code review.
- **`GET /api/prs/{id}/chat`**: Fetch chat thread history.
- **`POST /api/prs/{id}/chat`**: Send message to AI assistant.
- **`GET /api/prs/{id}/resolve-conflicts`**: Generate step-by-step conflict resolution guide.
- **`GET /api/prs/{id}/conflict-bash-script`**: Download executable `.sh` rebase script.
- **`GET /api/tags`**: Fetch all active PR tags.
- **`POST /api/prs/{id}/tags`**: Add tag to PR.
- **`DELETE /api/prs/{id}/tags/{tag}`**: Remove tag from PR.
- **`GET /api/groups`**: Fetch all staging workspace buckets.
- **`POST /api/groups`**: Create staging workspace bucket.
- **`DELETE /api/groups/{id}`**: Delete workspace bucket.
- **`POST /api/changelog`**: Generate and save release notes.
- **`GET /api/changelog`**: Fetch list of saved changelogs.
- **`DELETE /api/changelog/{id}`**: Delete saved changelog.
- **`GET /api/conflicts`**: Fetch file collisions matrix across PRs.
- **`GET /api/repos`**: Fetch tracked repositories list.
