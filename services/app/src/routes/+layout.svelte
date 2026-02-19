<script lang="ts">
	import { resolve } from '$app/paths';

	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<header class="stacked-fade-in mb-0 w-full border-b stacked-divider bg-[var(--stacked-surface)] px-4 py-3 sm:mb-0 sm:px-6">
	<div class="mx-auto flex w-full max-w-6xl items-center justify-between">
		<a href={resolve('/')} class="text-sm font-semibold tracking-wide text-[var(--stacked-text)] sm:text-base">stackdiff</a>
		<a
			href={resolve('/stacks/new')}
			class="rounded-md border border-[var(--stacked-accent)] bg-[var(--stacked-accent)] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#2a97ff] sm:text-sm"
		>
			Create feature
		</a>
	</div>
</header>

{@render children()}
