<script lang="ts">
	import { Button } from 'flowbite-svelte';
	import StageDiffFileView from '$lib/components/diff/StageDiffFileView.svelte';
	import type { StageDiffPayload } from '$lib/types/stack';

	interface Props {
		diff: StageDiffPayload;
		selectedLineIds?: string[];
		onLinePress?: (input: { lineId: string; filePath: string; shiftKey: boolean }) => void;
		showFileNav?: boolean;
	}

	interface FileNavItem {
		anchorId: string;
		path: string;
		additions: number;
		deletions: number;
	}

	let { diff, selectedLineIds = [], onLinePress, showFileNav = true }: Props = $props();
	let collapsedOverridesByAnchorId = $state<Record<string, boolean>>({});
	let activeFileAnchorId = $state<string | null>(null);
	const selectedLineIdSet = $derived(new Set(selectedLineIds));

	function toAnchorId(path: string, index: number): string {
		const normalized = path
			.toLowerCase()
			.replace(/[^a-z0-9/_-]/g, '-')
			.replace(/[/-]+/g, '-')
			.replace(/^-+|-+$/g, '');

		const safe = normalized.length > 0 ? normalized : 'file';
		return `stage-diff-file-${index}-${safe}`;
	}

	function scrollToFile(anchorId: string): void {
		collapsedOverridesByAnchorId[anchorId] = false;
		activeFileAnchorId = anchorId;
		const target = document.getElementById(anchorId);
		target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	function setFileCollapsed(anchorId: string, nextCollapsed: boolean): void {
		collapsedOverridesByAnchorId[anchorId] = nextCollapsed;
	}

	function isLockfile(path: string): boolean {
		const fileName = path.split('/').at(-1)?.toLowerCase() ?? path.toLowerCase();
		return fileName === 'package-lock.json' || fileName === 'pnpm-lock.yaml' || fileName === 'yarn.lock';
	}

	function expandAllFiles(): void {
		for (const item of fileNavItems) {
			collapsedOverridesByAnchorId[item.anchorId] = false;
		}
	}

	function collapseAllFiles(): void {
		for (const item of fileNavItems) {
			collapsedOverridesByAnchorId[item.anchorId] = true;
		}
	}

	const fileNavItems = $derived(
		diff.files.map((file, index) => ({
			anchorId: toAnchorId(file.path, index),
			path: file.path,
			additions: file.additions,
			deletions: file.deletions
		}))
	);

	const defaultCollapsedByAnchorId = $derived.by(() => {
		const defaults: Record<string, boolean> = {};
		for (let index = 0; index < fileNavItems.length; index += 1) {
			const item = fileNavItems[index];
			defaults[item.anchorId] = index >= 3 || isLockfile(item.path);
		}

		return defaults;
	});

	const collapsedByAnchorId = $derived({
		...defaultCollapsedByAnchorId,
		...collapsedOverridesByAnchorId
	});

	const resolvedActiveFileAnchorId = $derived(activeFileAnchorId ?? fileNavItems[0]?.anchorId ?? null);
</script>

<section class="stage-diff-structured-view" aria-label="Structured stage diff">
	{#if showFileNav}
		<nav class="stage-diff-file-nav" aria-label="Diff files">
			<div class="stage-diff-file-nav-header">
				<p class="stage-diff-file-nav-label">Files</p>
				<div class="stage-diff-file-nav-actions">
					<Button size="xs" color="alternative" onclick={expandAllFiles}>Expand all</Button>
					<Button size="xs" color="alternative" onclick={collapseAllFiles}>Collapse all</Button>
				</div>
			</div>
			<div class="stage-diff-file-nav-list">
				{#each fileNavItems as item (item.anchorId)}
					<button
						type="button"
						class={`stage-diff-file-nav-item ${resolvedActiveFileAnchorId === item.anchorId ? 'is-active' : ''}`}
						onclick={() => scrollToFile(item.anchorId)}
					>
						<span class="stage-diff-file-nav-path">{item.path}</span>
						<span class="stage-diff-file-nav-meta">+{item.additions} -{item.deletions}</span>
					</button>
				{/each}
			</div>
		</nav>
	{/if}

	<div class="stage-diff-file-list">
		{#each diff.files as file, index (`${file.path}:${index}`)}
			<StageDiffFileView
				file={file}
				anchorId={fileNavItems[index]?.anchorId ?? toAnchorId(file.path, index)}
				collapsed={collapsedByAnchorId[fileNavItems[index]?.anchorId ?? toAnchorId(file.path, index)] ?? false}
				selectedLineIds={selectedLineIdSet}
				{onLinePress}
				onToggleCollapsed={(nextCollapsed) =>
					setFileCollapsed(fileNavItems[index]?.anchorId ?? toAnchorId(file.path, index), nextCollapsed)}
			/>
		{/each}
	</div>
</section>

<style>
	.stage-diff-structured-view {
		display: grid;
		gap: 0.8rem;
	}

	.stage-diff-file-nav {
		display: grid;
		gap: 0.45rem;
		padding: 0.75rem;
		border: 1px solid var(--stacked-border-soft);
		border-radius: 12px;
		background: color-mix(in oklab, var(--stacked-bg-soft) 88%, transparent);
	}

	.stage-diff-file-nav-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.stage-diff-file-nav-actions {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}

	.stage-diff-file-nav-label {
		margin: 0;
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--stacked-text-muted);
	}

	.stage-diff-file-nav-list {
		display: flex;
		gap: 0.5rem;
		overflow-x: auto;
		padding-bottom: 0.1rem;
	}

	.stage-diff-file-nav-item {
		display: grid;
		gap: 0.12rem;
		min-width: min(280px, 72vw);
		padding: 0.45rem 0.55rem;
		border-radius: 9px;
		border: 1px solid color-mix(in oklab, var(--stacked-border-soft) 88%, transparent);
		background: color-mix(in oklab, var(--stacked-surface-elevated) 80%, transparent);
		text-align: left;
		cursor: pointer;
		transition: border-color 130ms ease, transform 130ms ease;
	}

	.stage-diff-file-nav-item:hover {
		border-color: color-mix(in oklab, var(--stacked-accent) 40%, var(--stacked-border-soft));
		transform: translateY(-1px);
	}

	.stage-diff-file-nav-item.is-active {
		border-color: color-mix(in oklab, var(--stacked-accent) 55%, var(--stacked-border-soft));
		box-shadow: 0 0 0 1px color-mix(in oklab, var(--stacked-accent) 35%, transparent);
	}

	.stage-diff-file-nav-path {
		font-size: 0.73rem;
		color: var(--stacked-text);
		word-break: break-word;
	}

	.stage-diff-file-nav-meta {
		font-size: 0.68rem;
		color: var(--stacked-text-muted);
	}

	.stage-diff-file-list {
		display: grid;
		gap: 0.8rem;
	}
</style>
