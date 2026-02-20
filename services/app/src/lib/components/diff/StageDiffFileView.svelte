<script lang="ts">
	import StageDiffHunkView from '$lib/components/diff/StageDiffHunkView.svelte';
	import type { StageDiffFile } from '$lib/types/stack';

	interface Props {
		file: StageDiffFile;
		anchorId: string;
		collapsed: boolean;
		onToggleCollapsed?: (nextCollapsed: boolean) => void;
		selectedLineIds?: Set<string>;
		onLinePress?: (input: { lineId: string; filePath: string; shiftKey: boolean }) => void;
	}

	let { file, anchorId, collapsed, onToggleCollapsed, selectedLineIds, onLinePress }: Props = $props();

	function changeTypeChipClass(changeType: StageDiffFile['changeType']): string {
		if (changeType === 'added') {
			return 'stacked-chip stacked-chip-success';
		}

		if (changeType === 'deleted') {
			return 'stacked-chip stacked-chip-danger';
		}

		if (changeType === 'renamed') {
			return 'stacked-chip stacked-chip-warning';
		}

		return 'stacked-chip';
	}

	function changeLabel(changeType: StageDiffFile['changeType']): string {
		if (changeType === 'added') {
			return 'Added';
		}

		if (changeType === 'deleted') {
			return 'Deleted';
		}

		if (changeType === 'renamed') {
			return 'Renamed';
		}

		return 'Modified';
	}

	function toggleCollapsed(): void {
		onToggleCollapsed?.(!collapsed);
	}
</script>

<article id={anchorId} class="stage-diff-file" data-stage-diff-file-path={file.path}>
	<header class="stage-diff-file-header">
		<div class="stage-diff-file-title-wrap">
			<div class="stage-diff-file-title-row">
				<button
					type="button"
					class="stage-diff-file-collapse"
					onclick={toggleCollapsed}
					aria-expanded={!collapsed}
					aria-controls={`${anchorId}-content`}
				>
					<span class="stage-diff-file-chevron" aria-hidden="true">{collapsed ? '>' : 'v'}</span>
					<span class="stage-diff-file-path">{file.path}</span>
				</button>
			</div>
			{#if file.changeType === 'renamed' && file.previousPath}
				<p class="stage-diff-file-previous">from {file.previousPath}</p>
			{:else if file.changeType === 'deleted' && file.previousPath}
				<p class="stage-diff-file-previous">previously {file.previousPath}</p>
			{/if}
		</div>
		<div class="stage-diff-file-meta">
			<span class={changeTypeChipClass(file.changeType)}>{changeLabel(file.changeType)}</span>
			<span class="stacked-chip stacked-chip-success">+{file.additions}</span>
			<span class="stacked-chip stacked-chip-danger">-{file.deletions}</span>
		</div>
	</header>

	{#if collapsed}
		<div id={`${anchorId}-content`} class="stage-diff-file-collapsed">
			<p>{file.hunks.length} {file.hunks.length === 1 ? 'hunk' : 'hunks'} hidden</p>
		</div>
	{:else if file.isBinary}
		<div class="stage-diff-file-binary">
			<p>Binary file change. Text diff is not available.</p>
		</div>
	{:else if file.hunks.length === 0}
		<div class="stage-diff-file-binary">
			<p>No textual hunk content in this file diff.</p>
		</div>
	{:else}
		<div id={`${anchorId}-content`} class="stage-diff-file-hunks">
			{#each file.hunks as hunk, hunkIndex (`${hunk.header}:${hunkIndex}`)}
				<StageDiffHunkView {hunk} filePath={file.path} {selectedLineIds} {onLinePress} />
			{/each}
		</div>
	{/if}
</article>

<style>
	.stage-diff-file {
		border: 1px solid var(--stacked-border-soft);
		border-radius: 12px;
		background: color-mix(in oklab, var(--stacked-bg-soft) 84%, transparent);
		overflow: hidden;
	}

	.stage-diff-file-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.6rem;
		padding: 0.7rem 0.8rem;
		border-bottom: 1px solid color-mix(in oklab, var(--stacked-border-soft) 88%, transparent);
	}

	.stage-diff-file-title-wrap {
		min-width: 0;
	}

	.stage-diff-file-title-row {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}

	.stage-diff-file-collapse {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0;
		border: 0;
		background: transparent;
		text-align: left;
		cursor: pointer;
	}

	.stage-diff-file-chevron {
		font-size: 0.7rem;
		line-height: 1;
		color: var(--stacked-text-muted);
	}

	.stage-diff-file-path {
		margin: 0;
		font-size: 0.78rem;
		line-height: 1.4;
		color: var(--stacked-text);
		word-break: break-word;
	}

	.stage-diff-file-collapsed {
		padding: 0.75rem 0.8rem;
		font-size: 0.74rem;
		color: var(--stacked-text-muted);
	}

	.stage-diff-file-collapsed p {
		margin: 0;
	}

	.stage-diff-file-previous {
		margin: 0.2rem 0 0;
		font-size: 0.72rem;
		line-height: 1.4;
		color: var(--stacked-text-muted);
		word-break: break-word;
	}

	.stage-diff-file-meta {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.35rem;
	}

	.stage-diff-file-binary {
		padding: 0.8rem;
		font-size: 0.78rem;
		color: var(--stacked-text-muted);
	}

	.stage-diff-file-binary p {
		margin: 0;
	}

	.stage-diff-file-hunks {
		display: grid;
		gap: 0.6rem;
		padding: 0.6rem;
	}
</style>
