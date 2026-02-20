<script lang="ts">
	import type { FeaturePageTabKey } from '../contracts';

	let {
		activeTab,
		onTabChange
	}: {
		activeTab: FeaturePageTabKey;
		onTabChange: (tab: FeaturePageTabKey) => void;
	} = $props();
</script>

<div class="mb-4 border-b stacked-divider">
	<div class="flex flex-wrap gap-1.5">
		<button
			type="button"
			onclick={() => onTabChange('plan')}
			class={`rounded-t-md border border-b-0 px-3 py-2 text-sm font-medium transition ${activeTab === 'plan'
				? 'border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)] text-[var(--stacked-text)]'
				: 'border-transparent text-[var(--stacked-text-muted)] hover:text-[var(--stacked-text)]'}`}
		>
			Plan
		</button>
		<button
			type="button"
			onclick={() => onTabChange('stack')}
			class={`rounded-t-md border border-b-0 px-3 py-2 text-sm font-medium transition ${activeTab === 'stack'
				? 'border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)] text-[var(--stacked-text)]'
				: 'border-transparent text-[var(--stacked-text-muted)] hover:text-[var(--stacked-text)]'}`}
		>
			Stack
		</button>
	</div>
</div>
