# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project
npx sv create my-app
```

To recreate this project with the same configuration:

```sh
# recreate this project
npx sv create --template minimal --types ts --no-install services/app
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Configuration

`stacked` reads project/runtime config from `~/.config/stacked/config.json` (or `STACKED_CONFIG_PATH` when set).

```json
{
  "version": 1,
  "defaultModel": "anthropic/claude-sonnet-4-6",
  "runtime": {
    "syncMode": "local",
    "pollIntervalMs": 15000,
    "prSnapshotTtlMs": 30000
  },
  "projects": [
    {
      "id": "my-repo",
      "name": "My Repo",
      "repositoryPath": "/absolute/path/to/repo"
    }
  ]
}
```

Runtime options:

- `syncMode`: `local | webhook | hybrid` (currently local behavior is active)
- `pollIntervalMs`: stack runtime stream polling interval in milliseconds
- `prSnapshotTtlMs`: TTL for deduping stack PR snapshot GraphQL reads

To run a production-like server locally:

```sh
# build first
npm run build

# start preview server on port 4173
npm run start

# or run both in one command
npm run serve
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can also preview the production build directly with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.
