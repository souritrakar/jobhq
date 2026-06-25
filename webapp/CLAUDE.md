@AGENTS.md

## QMD setup (project + global)

QMD is installed on this machine at:

- `/home/s7kar/.local/bin/qmd`

Claude Code MCP is configured:

- Globally in `~/.claude/settings.json`
- For this project in `../.claude/settings.json` (repo root)

Both use:

```json
"mcpServers": {
  "qmd": {
    "command": "/home/s7kar/.local/bin/qmd",
    "args": ["mcp"]
  }
}
```

## First-time project indexing

From repo root:

```bash
/home/s7kar/.local/bin/qmd collection add . --name jobtracker --mask "**/*.{md,ts,tsx,js,jsx,json}"
/home/s7kar/.local/bin/qmd context add qmd://jobtracker "JobTracker monorepo: webapp, extension, and docs."
/home/s7kar/.local/bin/qmd embed
```

Quick checks:

```bash
/home/s7kar/.local/bin/qmd status
/home/s7kar/.local/bin/qmd query "cover letter resume context"
```
