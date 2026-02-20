<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from 'flowbite-svelte';

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
		<Button href={resolve('/stacks/new')} size="sm" color="primary">
			Create feature
		</Button>
	</div>
</header>

{@render children()}
