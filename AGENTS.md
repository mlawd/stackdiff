# AGENTS

## Mission

Build and maintain `stacked`, a local-first tool for reviewing and editing stacked PR flows hosted on GitHub.

## Project structure

- Monorepo managed with npm workspaces.
- Services live under `services/*`.
- Current service:
  - `services/app`: SvelteKit frontend/server app.

## Core constraints

- Local-first only for now.
- GitHub communication must happen server-side through local `git` and `gh` CLI.
- Never require users to paste tokens into the UI.
- Prefer deterministic, typed server utilities for shell execution.

## Storage strategy

- Source of truth for stack metadata is JSON (`services/app/data/stacks.json`).
- Runtime page load enriches each stack with live git/gh status.
- Keep storage behind an interface so SQLite can replace JSON later.
- No backward compatibility requirements for early schema iterations.

## Runtime repository model

- The app operates on the repository containing the running server process.
- Do not store per-stack repository paths.
- Do not store branch hierarchy in stack metadata for now.

## Coding guidelines

- Keep modules small and focused.
- Use explicit TypeScript types for stack domain objects.
- Handle CLI failures gracefully and return actionable errors in UI-safe shape.
- Avoid adding dependencies unless they provide clear value.

## Operational commands

- Install: `npm install`
- Dev: `npm run dev`
- Type checks: `npm run check`
- Build: `npm run build`

# Svelte

Delegate to `svelte-agent` if the task involves:

- Svelte or SvelteKit
- `.svelte`, `+page.svelte`, `+layout.svelte`
- Stores, actions, transitions, slots
- SvelteKit routing, load functions, adapters
- Vite configuration specific to Svelte

### How to delegate

- Forward the full user request and any relevant context
- Allow the sub-agent to respond directly
- Integrate responses only when needed

### Do not delegate

- Non-Svelte frameworks
- High-level product or UX discussions
- Tasks unrelated to frontend implementation

You are able to use the Svelte MCP server, where you have access to comprehensive Svelte 5 and SvelteKit documentation. Here's how to use the available tools effectively:

## Available MCP Tools:

### 1. list-sections

Use this FIRST to discover all available documentation sections. Returns a structured list with titles, use_cases, and paths.
When asked about Svelte or SvelteKit topics, ALWAYS use this tool at the start of the chat to find relevant sections.

### 2. get-documentation

Retrieves full documentation content for specific sections. Accepts single or multiple sections.
After calling the list-sections tool, you MUST analyze the returned documentation sections (especially the use_cases field) and then use the get-documentation tool to fetch ALL documentation sections that are relevant for the user's task.

### 3. svelte-autofixer

Analyzes Svelte code and returns issues and suggestions.
You MUST use this tool whenever writing Svelte code before sending it to the user. Keep calling it until no issues or suggestions are returned.

### 4. playground-link

Generates a Svelte Playground link with the provided code.
After completing the code, ask the user if they want a playground link. Only call this tool after user confirmation and NEVER if code was written to files in their project.

# Flowbite Svelte

You are able to use the Flowbite-Svelte MCP server, where you have access to comprehensive Flowbite-Svelte component documentation. Here's how to use the available tools effectively:

## Available MCP Tools:

### 1. findComponent

Use this FIRST to discover components by name or category. Returns component information including the documentation path.
When asked about Flowbite-Svelte components, ALWAYS use this tool to locate the correct component before fetching documentation.
Example queries: 'Button', 'CardPlaceholder', 'form checkbox'

### 2. getComponentList

Lists all available Flowbite-Svelte components with their categories.
Use this to discover what components are available or to help users explore component options.

### 3. getComponentDoc

Retrieves full documentation content for a specific component. Accepts the component path found using findComponent.
After calling findComponent, use this tool to fetch the complete documentation including usage examples, props, and best practices.

### 4. searchDocs

Performs full-text search across all Flowbite-Svelte documentation.
Use this when you need to find specific information that might span multiple components or when the user asks about features or patterns.
