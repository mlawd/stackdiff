# stacked

Local-first workspace for managing stacked GitHub pull request flows.

## Workspace

- npm workspaces monorepo
- service today: `services/app` (SvelteKit + Flowbite-Svelte)

## Requirements

- Node.js 20+
- `git` installed and authenticated for your local repos
- GitHub CLI (`gh`) installed and authenticated (`gh auth status`)

## Commands

```bash
npm install
npm run dev
npm run check
npm run build
```

## Data model (initial)

Stack hierarchy metadata lives in `services/app/data/stacks.json`.
At runtime, the app enriches that metadata with live `git` and `gh` status server-side.

## Project configuration

Projects are configured in `~/.config/stacked/config.json`:

```json
{
  "version": 1,
  "projects": [
    {
      "id": "stacked",
      "name": "stacked",
      "repositoryPath": "/absolute/path/to/repository"
    }
  ]
}
```

Each stack is associated with a configured `projectId`, and all runtime git/gh/opencode operations use that project's repository path.
