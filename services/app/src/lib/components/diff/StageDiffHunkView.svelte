<script lang="ts">
	import StageDiffLinePairRow from '$lib/components/diff/StageDiffLinePairRow.svelte';
	import type { StageDiffHunk, StageDiffLine } from '$lib/types/stack';

	interface SideBySideRow {
		rowId: string;
		leftLine: StageDiffLine | null;
		rightLine: StageDiffLine | null;
	}

	interface Props {
		hunk: StageDiffHunk;
		filePath: string;
		selectedLineIds?: Set<string>;
		onLinePress?: (input: { lineId: string; filePath: string; shiftKey: boolean }) => void;
	}

	let { hunk, filePath, selectedLineIds, onLinePress }: Props = $props();

	function pairHunkLines(lines: StageDiffLine[]): SideBySideRow[] {
		const rows: SideBySideRow[] = [];
		let index = 0;

		while (index < lines.length) {
			const line = lines[index];

			if (line.type === 'context') {
				rows.push({
					rowId: `ctx:${line.lineId}`,
					leftLine: line,
					rightLine: line
				});
				index += 1;
				continue;
			}

			if (line.type === 'del') {
				const nextLine = lines[index + 1];
				if (nextLine?.type === 'add') {
					rows.push({
						rowId: `pair:${line.lineId}:${nextLine.lineId}`,
						leftLine: line,
						rightLine: nextLine
					});
					index += 2;
					continue;
				}

				rows.push({
					rowId: `del:${line.lineId}`,
					leftLine: line,
					rightLine: null
				});
				index += 1;
				continue;
			}

			rows.push({
				rowId: `add:${line.lineId}`,
				leftLine: null,
				rightLine: line
			});
			index += 1;
		}

		return rows;
	}

	const pairedRows = $derived(pairHunkLines(hunk.lines));
</script>

<section class="stage-diff-hunk">
	<header class="stage-diff-hunk-header">
		<p>{hunk.header}</p>
	</header>
	<div class="stage-diff-hunk-table stacked-scroll" role="table" aria-label="Hunk lines">
		<div class="stage-diff-column-head" role="row">
			<div role="columnheader">Base</div>
			<div role="columnheader">Target</div>
		</div>
		{#each pairedRows as row (row.rowId)}
			<div role="row">
				<StageDiffLinePairRow
					leftLine={row.leftLine}
					rightLine={row.rightLine}
					{filePath}
					{selectedLineIds}
					{onLinePress}
				/>
			</div>
		{/each}
	</div>
</section>

<style>
	.stage-diff-hunk {
		border: 1px solid color-mix(in oklab, var(--stacked-border-soft) 88%, transparent);
		border-radius: 10px;
		overflow: hidden;
	}

	.stage-diff-hunk-header {
		padding: 0.45rem 0.7rem;
		border-bottom: 1px solid color-mix(in oklab, var(--stacked-border-soft) 88%, transparent);
		background: color-mix(in oklab, var(--stacked-bg-soft) 84%, transparent);
		font-size: 0.74rem;
		color: var(--stacked-text-muted);
	}

	.stage-diff-hunk-header p {
		margin: 0;
		font-family: 'JetBrains Mono', 'Fira Code', monospace;
		white-space: pre-wrap;
	}

	.stage-diff-hunk-table {
		overflow-x: auto;
	}

	.stage-diff-column-head {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		border-bottom: 1px solid color-mix(in oklab, var(--stacked-border-soft) 88%, transparent);
	}

	.stage-diff-column-head > div {
		margin: 0;
		padding: 0.4rem 0.7rem;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--stacked-text-muted);
	}

	.stage-diff-column-head > div + div {
		border-left: 1px solid color-mix(in oklab, var(--stacked-border-soft) 88%, transparent);
	}

	@media (max-width: 720px) {
		.stage-diff-column-head {
			grid-template-columns: minmax(0, 1fr);
		}

		.stage-diff-column-head > div + div {
			border-left: 0;
			border-top: 1px solid color-mix(in oklab, var(--stacked-border-soft) 88%, transparent);
		}
	}
</style>
