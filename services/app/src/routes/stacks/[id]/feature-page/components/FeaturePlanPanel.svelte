<script lang="ts">
	import PlanningChat from '$lib/components/PlanningChat.svelte';
	import type { PageData } from '../../$types';

	let {
		stackId,
		session,
		messages,
		awaitingResponse
	}: {
		stackId: string;
		session: PageData['session'];
		messages: PageData['messages'];
		awaitingResponse: PageData['awaitingResponse'];
	} = $props();
</script>

<div class="stacked-panel-elevated p-4">
	<PlanningChat {stackId} {session} {messages} {awaitingResponse} />
</div>
