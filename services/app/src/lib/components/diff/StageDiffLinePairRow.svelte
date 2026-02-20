<script lang="ts">
	import { toHighlightedDiffLine } from '$lib/components/diff/stage-diff-highlight';
	import type { StageDiffLine } from '$lib/types/stack';

	interface Props {
		leftLine: StageDiffLine | null;
		rightLine: StageDiffLine | null;
		filePath: string;
	}

	let { leftLine, rightLine, filePath }: Props = $props();

	function sideClass(line: StageDiffLine | null): string {
		if (!line) {
			return 'stage-diff-side-empty';
		}

		if (line.type === 'add') {
			return 'stage-diff-side-add';
		}

		if (line.type === 'del') {
			return 'stage-diff-side-del';
		}

		return 'stage-diff-side-context';
	}

	function numberText(value: number | null | undefined): string {
		if (value === null || value === undefined) {
			return '';
		}

		return `${value}`;
	}

	function lineHtml(line: StageDiffLine | null): string {
		if (!line) {
			return '';
		}

		return toHighlightedDiffLine({ content: line.content, filePath }).html;
	}
</script>

<div
	class="stage-diff-paired-row"
	data-left-line-id={leftLine?.lineId}
	data-right-line-id={rightLine?.lineId}
>
	<div class={`stage-diff-side ${sideClass(leftLine)}`} data-line-id={leftLine?.lineId}>
		<div class="stage-diff-line-numbers" aria-hidden="true">
			<span>{numberText(leftLine?.oldLineNumber)}</span>
			<span>{numberText(leftLine?.newLineNumber)}</span>
		</div>
		<code class="stage-diff-line-content">{@html lineHtml(leftLine)}</code>
	</div>

	<div class={`stage-diff-side ${sideClass(rightLine)}`} data-line-id={rightLine?.lineId}>
		<div class="stage-diff-line-numbers" aria-hidden="true">
			<span>{numberText(rightLine?.oldLineNumber)}</span>
			<span>{numberText(rightLine?.newLineNumber)}</span>
		</div>
		<code class="stage-diff-line-content">{@html lineHtml(rightLine)}</code>
	</div>
</div>

<style>
	.stage-diff-paired-row {
		display: grid;
		grid-template-columns: minmax(260px, 1fr) minmax(260px, 1fr);
		border-bottom: 1px solid color-mix(in oklab, var(--stacked-border-soft) 78%, transparent);
	}

	.stage-diff-side {
		display: grid;
		grid-template-columns: auto 1fr;
		min-width: 0;
	}

	.stage-diff-side + .stage-diff-side {
		border-left: 1px solid color-mix(in oklab, var(--stacked-border-soft) 88%, transparent);
	}

	.stage-diff-line-numbers {
		display: grid;
		grid-template-columns: repeat(2, minmax(2.6rem, auto));
		gap: 0.35rem;
		padding: 0.38rem 0.45rem;
		border-right: 1px solid color-mix(in oklab, var(--stacked-border-soft) 82%, transparent);
		font-size: 0.68rem;
		line-height: 1.45;
		color: var(--stacked-text-muted);
		text-align: right;
		user-select: none;
	}

	.stage-diff-line-content {
		display: block;
		margin: 0;
		padding: 0.38rem 0.55rem;
		font-size: 0.78rem;
		line-height: 1.45;
		font-family: 'JetBrains Mono', 'Fira Code', monospace;
		white-space: pre;
		overflow-x: auto;
		color: var(--stacked-text);
	}

	:global(.stage-diff-line-content .hljs-keyword),
	:global(.stage-diff-line-content .hljs-selector-tag),
	:global(.stage-diff-line-content .hljs-literal) {
		color: color-mix(in oklab, var(--stacked-accent) 70%, white);
	}

	:global(.stage-diff-line-content .hljs-string),
	:global(.stage-diff-line-content .hljs-attr),
	:global(.stage-diff-line-content .hljs-template-tag) {
		color: color-mix(in oklab, var(--stacked-success) 80%, white);
	}

	:global(.stage-diff-line-content .hljs-comment),
	:global(.stage-diff-line-content .hljs-quote) {
		color: color-mix(in oklab, var(--stacked-text-muted) 86%, #8fa0b6);
	}

	.stage-diff-side-empty .stage-diff-line-content {
		color: transparent;
	}

	.stage-diff-side-add {
		background: color-mix(in oklab, var(--stacked-success) 14%, transparent);
	}

	.stage-diff-side-del {
		background: color-mix(in oklab, var(--stacked-danger) 14%, transparent);
	}

	.stage-diff-side-context {
		background: color-mix(in oklab, var(--stacked-bg-soft) 82%, transparent);
	}

	.stage-diff-side-empty {
		background: color-mix(in oklab, var(--stacked-bg-soft) 56%, transparent);
	}

	@media (max-width: 720px) {
		.stage-diff-paired-row {
			grid-template-columns: minmax(420px, 1fr);
		}

		.stage-diff-side + .stage-diff-side {
			border-left: 0;
			border-top: 1px solid color-mix(in oklab, var(--stacked-border-soft) 88%, transparent);
		}
	}
</style>
