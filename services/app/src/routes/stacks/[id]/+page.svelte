<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Badge, Button, Spinner } from 'flowbite-svelte';
	import AnnotationSolid from 'flowbite-svelte-icons/AnnotationSolid.svelte';
	import CodePullRequestSolid from 'flowbite-svelte-icons/CodePullRequestSolid.svelte';
	import PlanningChat from '$lib/components/PlanningChat.svelte';
	import StageDiffStructuredView from '$lib/components/diff/StageDiffStructuredView.svelte';
	import {
		canStartFeature as canStartFeatureWithRuntime,
		implementationStageLabel,
		stagePullRequest as resolveStagePullRequest,
		stageStatus as resolveStageStatus,
		startButtonLabel as startButtonLabelWithRuntime,
		statusLabel,
		typeLabel
	} from './feature-page/behavior';
	import type {
		FeaturePageTabKey,
		ImplementationStageRuntime,
		ImplementationStatusResponse,
		OrderedDiffLine,
		StageDiffChatErrorResponse,
		StageDiffChatSuccessResponse,
		StageDiffErrorResponse,
		StageDiffSuccessResponse,
		StartResponse
	} from './feature-page/contracts';

	import type {
		FeatureStageStatus,
		DiffSelection,
		StageDiffPayload,
		StageDiffabilityMetadata,
		StageSyncMetadata,
		StackPullRequest,
		StackStatus
	} from '$lib/types/stack';
	import type { PageData } from './$types';

	interface SyncStackResponse {
		result?: {
			totalStages: number;
			rebasedStages: number;
			skippedStages: number;
		};
		error?: {
			code?: string;
			message?: string;
		};
	}

	type BadgeColor = 'gray' | 'yellow' | 'green' | 'red' | 'purple';

	let { data }: { data: PageData } = $props();

	const typeColor: Record<'feature' | 'bugfix' | 'chore', BadgeColor> = {
		feature: 'purple',
		bugfix: 'red',
		chore: 'gray'
	};

	const statusColor: Record<StackStatus, BadgeColor> = {
		created: 'gray',
		planned: 'yellow',
		started: 'purple',
		complete: 'green'
	};
	let tabInitialized = false;
	let activeTab = $state<FeaturePageTabKey>('plan');
	let startPending = $state(false);
	let startError = $state<string | null>(null);
	let startSuccess = $state<string | null>(null);
	let syncPending = $state(false);
	let syncError = $state<string | null>(null);
	let syncSuccess = $state<string | null>(null);
	let implementationRuntimeByStageId = $state<Record<string, ImplementationStageRuntime>>({});
	let isStageDiffPanelOpen = $state(false);
	let activeDiffStageId = $state<string | null>(null);
	let activeDiffStageTitle = $state<string | null>(null);
	let stageDiffCache = $state<Record<string, StageDiffPayload>>({});
	let stageDiffErrors = $state<Record<string, string>>({});
	let loadingDiffStageId = $state<string | null>(null);
	let selectedDiffLineIdsByStageId = $state<Record<string, string[]>>({});
	let selectedDiffFilePathByStageId = $state<Record<string, string | null>>({});
	let selectionAnchorLineIdByStageId = $state<Record<string, string | null>>({});
	let selectedDiffChatMessageByStageId = $state<Record<string, string>>({});
	let stageDiffChatReplyByStageId = $state<Record<string, string>>({});
	let stageDiffChatErrorsByStageId = $state<Record<string, string>>({});
	let stageDiffChatSendingByStageId = $state<Record<string, boolean>>({});
	let stageDiffAbortController: AbortController | null = null;
	let stageDiffCloseButton: HTMLButtonElement | null = null;
	let previousFocusedElement: HTMLElement | null = null;
	let previousBodyOverflow = '';
	let runtimeInvalidating = false;

	$effect(() => {
		if (tabInitialized) {
			return;
		}

		activeTab = data.stack.status === 'created' ? 'plan' : 'stack';
		tabInitialized = true;
	});

	function implementationStageColor(status: FeatureStageStatus): BadgeColor {
		if (status === 'done') {
			return 'green';
		}

		if (status === 'review-ready') {
			return 'purple';
		}

		if (status === 'in-progress') {
			return 'yellow';
		}

		return 'gray';
	}

	function canStartFeature(): boolean {
		return (
			canStartFeatureWithRuntime({
				stages: data.stack.stages ?? [],
				implementationRuntimeByStageId,
				startPending
			}) && !syncPending
		);
	}

	function stageSyncMetadata(stageId: string): StageSyncMetadata {
		return (
			data.stack.stageSyncById?.[stageId] ?? {
				isOutOfSync: false,
				behindBy: 0,
				reasonIfUnavailable: 'Stage sync status is unavailable.'
			}
		);
	}

	function hasOutOfSyncStages(): boolean {
		return (data.stack.stages ?? []).some((stage) => stageSyncMetadata(stage.id).isOutOfSync);
	}

	function canSyncStack(): boolean {
		return hasOutOfSyncStages() && !syncPending && !startPending;
	}

	function syncStackButtonLabel(): string {
		if (syncPending) {
			return 'Syncing...';
		}

		return 'Sync Stack';
	}

	function startButtonLabel(): string {
		return startButtonLabelWithRuntime({
			stages: data.stack.stages ?? [],
			implementationRuntimeByStageId,
			startPending
		});
	}

	function stageStatus(stageId: string, fallback: FeatureStageStatus): FeatureStageStatus {
		return resolveStageStatus(implementationRuntimeByStageId, stageId, fallback);
	}

	function stagePullRequest(stageId: string, fallback?: StackPullRequest): StackPullRequest | undefined {
		return resolveStagePullRequest(implementationRuntimeByStageId, stageId, fallback);
	}

	function stageIdsForRuntimePolling(): string[] {
		return (data.stack.stages ?? [])
			.filter((stage) => {
				const currentStatus = stageStatus(stage.id, stage.status);
				const currentPullRequest = stagePullRequest(stage.id, stage.pullRequest);
				return currentStatus === 'in-progress' || (currentStatus === 'review-ready' && !currentPullRequest?.number);
			})
			.map((stage) => stage.id);
	}

	function isStageAgentWorking(stageId: string): boolean {
		const runtime = implementationRuntimeByStageId[stageId];
		return runtime?.runtimeState === 'busy' || runtime?.runtimeState === 'retry';
	}

	async function refreshImplementationRuntime(): Promise<void> {
		const stageIds = stageIdsForRuntimePolling();
		if (stageIds.length === 0) {
			return;
		}

		let shouldInvalidate = false;

		const entries = await Promise.all(
			stageIds.map(async (stageId) => {
				const stageEntry = (data.stack.stages ?? []).find((stage) => stage.id === stageId);
				const fallbackStatus = stageEntry ? stageStatus(stageId, stageEntry.status) : 'in-progress';

				try {
					const response = await fetch(`/api/stacks/${data.stack.id}/stages/${stageId}/implementation/status`);
					const payload = (await response.json()) as ImplementationStatusResponse;
					if (!response.ok) {
						throw new Error(payload.error ?? 'Unable to load implementation status.');
					}

					return [
						stageId,
						{
							stageStatus: payload.stageStatus ?? fallbackStatus,
							runtimeState: payload.runtimeState ?? 'missing',
							todoCompleted: payload.todoCompleted ?? 0,
							todoTotal: payload.todoTotal ?? 0,
							pullRequest: payload.pullRequest
						} satisfies ImplementationStageRuntime
					] as const;
				} catch {
					return [
						stageId,
						{
							stageStatus: fallbackStatus,
							runtimeState: 'missing',
							todoCompleted: 0,
							todoTotal: 0,
							pullRequest: undefined
						} satisfies ImplementationStageRuntime
					] as const;
				}
			})
		);

		const nextRuntime = {
			...implementationRuntimeByStageId,
			...Object.fromEntries(entries)
		};

		for (const [stageId, runtime] of entries) {
			const stageEntry = (data.stack.stages ?? []).find((stage) => stage.id === stageId);
			if (!stageEntry) {
				continue;
			}

			if (stageEntry.status === 'in-progress' && runtime.stageStatus !== 'in-progress') {
				shouldInvalidate = true;
			}

			if (runtime.pullRequest && !stageEntry.pullRequest?.number) {
				shouldInvalidate = true;
			}
		}

		implementationRuntimeByStageId = nextRuntime;

		if (shouldInvalidate && !runtimeInvalidating) {
			runtimeInvalidating = true;
			try {
				await invalidateAll();
			} finally {
				runtimeInvalidating = false;
			}
		}
	}

	$effect(() => {
		if (activeTab !== 'stack') {
			return;
		}

		const stageIds = stageIdsForRuntimePolling();
		if (stageIds.length === 0) {
			return;
		}

		let cancelled = false;
		let timer: ReturnType<typeof setTimeout> | undefined;

		const poll = async () => {
			await refreshImplementationRuntime();
			if (cancelled) {
				return;
			}

			timer = setTimeout(poll, 2000);
		};

		void poll();

		return () => {
			cancelled = true;
			if (timer !== undefined) {
				clearTimeout(timer);
			}
		};
	});

	function stageDiffability(stageId: string): StageDiffabilityMetadata {
		return (
			data.stack.stageDiffabilityById?.[stageId] ?? {
				isDiffable: false,
				reasonIfNotDiffable: 'Stage diff is unavailable.'
			}
		);
	}

	function canOpenStageDiff(stageId: string): boolean {
		return stageDiffability(stageId).isDiffable;
	}

	async function loadStageDiff(stageId: string): Promise<void> {
		if (stageDiffCache[stageId]) {
			return;
		}

		if (loadingDiffStageId === stageId) {
			return;
		}

		loadingDiffStageId = stageId;
		delete stageDiffErrors[stageId];

		stageDiffAbortController?.abort();
		stageDiffAbortController = new AbortController();

		try {
			const response = await fetch(`/api/stacks/${data.stack.id}/stages/${stageId}/diff`, {
				method: 'GET',
				signal: stageDiffAbortController.signal
			});
			if (!response.ok) {
				const body = (await response.json()) as StageDiffErrorResponse;
				throw new Error(body.error?.message ?? 'Unable to load stage diff.');
			}

			const body = (await response.json()) as StageDiffSuccessResponse;
			stageDiffCache[stageId] = body.diff;
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') {
				return;
			}

			stageDiffErrors[stageId] =
				error instanceof Error ? error.message : 'Unable to load stage diff.';
		} finally {
			if (loadingDiffStageId === stageId) {
				loadingDiffStageId = null;
			}
		}
	}

	function openStageDiff(stageId: string, stageTitle: string): void {
		if (!canOpenStageDiff(stageId)) {
			return;
		}

		activeDiffStageId = stageId;
		activeDiffStageTitle = stageTitle;
		isStageDiffPanelOpen = true;

		void loadStageDiff(stageId);
	}

	function orderedLinesForDiff(diff: StageDiffPayload): OrderedDiffLine[] {
		const lines: OrderedDiffLine[] = [];

		for (const file of diff.files) {
			for (const hunk of file.hunks) {
				for (const line of hunk.lines) {
					lines.push({
						lineId: line.lineId,
						filePath: file.path,
						content: line.content,
						type: line.type
					});
				}
			}
		}

		return lines;
	}

	function linePrefix(type: 'context' | 'add' | 'del'): string {
		if (type === 'add') {
			return '+';
		}

		if (type === 'del') {
			return '-';
		}

		return ' ';
	}

	function selectedLineIdsForStage(stageId: string): string[] {
		return selectedDiffLineIdsByStageId[stageId] ?? [];
	}

	function selectedFilePathForStage(stageId: string): string | null {
		return selectedDiffFilePathByStageId[stageId] ?? null;
	}

	function clearSelectedLinesForStage(stageId: string): void {
		selectedDiffLineIdsByStageId[stageId] = [];
		selectedDiffFilePathByStageId[stageId] = null;
		selectionAnchorLineIdByStageId[stageId] = null;
	}

	function applyStageLineSelection(input: { lineId: string; filePath: string; shiftKey: boolean }): void {
		if (!activeDiffStageId || !activeStageDiff) {
			return;
		}

		const stageId = activeDiffStageId;
		const orderedLines = orderedLinesForDiff(activeStageDiff);
		const lineIds = orderedLines.map((line) => line.lineId);
		const clickedIndex = lineIds.indexOf(input.lineId);
		if (clickedIndex === -1) {
			return;
		}

		const currentFilePath = selectedFilePathForStage(stageId);
		const currentSelection = selectedLineIdsForStage(stageId);
		const currentSelectionSet = new Set(currentSelection);
		const anchorLineId = selectionAnchorLineIdByStageId[stageId] ?? null;
		const anchorIndex = anchorLineId ? lineIds.indexOf(anchorLineId) : -1;

		if (
			currentFilePath &&
			currentFilePath !== input.filePath &&
			(currentSelection.length > 0 || input.shiftKey)
		) {
			selectedDiffLineIdsByStageId[stageId] = [input.lineId];
			selectedDiffFilePathByStageId[stageId] = input.filePath;
			selectionAnchorLineIdByStageId[stageId] = input.lineId;
			delete stageDiffChatReplyByStageId[stageId];
			delete stageDiffChatErrorsByStageId[stageId];
			return;
		}

		if (input.shiftKey && anchorIndex !== -1) {
			const start = Math.min(anchorIndex, clickedIndex);
			const end = Math.max(anchorIndex, clickedIndex);
			for (let index = start; index <= end; index += 1) {
				const rangeLine = orderedLines[index];
				if (rangeLine.filePath === input.filePath) {
					currentSelectionSet.add(rangeLine.lineId);
				}
			}
		} else if (currentSelectionSet.has(input.lineId)) {
			currentSelectionSet.delete(input.lineId);
		} else {
			currentSelectionSet.add(input.lineId);
		}

		const nextSelection: string[] = [];
		for (const line of orderedLines) {
			if (line.filePath === input.filePath && currentSelectionSet.has(line.lineId)) {
				nextSelection.push(line.lineId);
			}
		}

		selectedDiffLineIdsByStageId[stageId] = nextSelection;
		selectedDiffFilePathByStageId[stageId] = nextSelection.length > 0 ? input.filePath : null;
		selectionAnchorLineIdByStageId[stageId] = input.lineId;
		delete stageDiffChatReplyByStageId[stageId];
		delete stageDiffChatErrorsByStageId[stageId];
	}

	function selectedSnippetForActiveStage(): string {
		if (!activeDiffStageId || !activeStageDiff) {
			return '';
		}

		const stageId = activeDiffStageId;
		const selectedLineIds = selectedLineIdsForStage(stageId);
		if (selectedLineIds.length === 0) {
			return '';
		}

		const selectedLineSet = new Set(selectedLineIds);
		const selectedFilePath = selectedFilePathForStage(stageId);
		if (!selectedFilePath) {
			return '';
		}

		const orderedLines = orderedLinesForDiff(activeStageDiff);
		return orderedLines
			.filter((line) => line.filePath === selectedFilePath && selectedLineSet.has(line.lineId))
			.map((line) => `${linePrefix(line.type)}${line.content}`)
			.join('\n');
	}

	function canStartFocusedDiffChat(): boolean {
		if (!activeDiffStageId || !activeStageDiff) {
			return false;
		}

		return selectedLineIdsForStage(activeDiffStageId).length > 0;
	}

	async function startFocusedDiffChat(): Promise<void> {
		if (!activeDiffStageId || !activeStageDiff || !canStartFocusedDiffChat()) {
			return;
		}

		const stageId = activeDiffStageId;
		const filePath = selectedFilePathForStage(stageId);
		if (!filePath) {
			return;
		}

		const selection: DiffSelection = {
			refs: {
				baseRef: activeStageDiff.baseRef,
				targetRef: activeStageDiff.targetRef
			},
			filePath,
			selectedLineIds: selectedLineIdsForStage(stageId),
			snippet: selectedSnippetForActiveStage()
		};

		stageDiffChatSendingByStageId[stageId] = true;
		delete stageDiffChatErrorsByStageId[stageId];

		try {
			const response = await fetch(`/api/stacks/${data.stack.id}/stages/${stageId}/diff/chat`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					selection,
					message: (selectedDiffChatMessageByStageId[stageId] ?? '').trim() || undefined
				})
			});

			if (!response.ok) {
				const body = (await response.json()) as StageDiffChatErrorResponse;
				throw new Error(body.error?.message ?? 'Unable to start focused stage chat.');
			}

			const body = (await response.json()) as StageDiffChatSuccessResponse;
			stageDiffChatReplyByStageId[stageId] = body.result.assistantReply;
		} catch (error) {
			stageDiffChatErrorsByStageId[stageId] =
				error instanceof Error ? error.message : 'Unable to start focused stage chat.';
		} finally {
			stageDiffChatSendingByStageId[stageId] = false;
		}
	}

	function closeStageDiffPanel(): void {
		isStageDiffPanelOpen = false;
	}

	function orderedDiffableStages(): Array<{ id: string; title: string }> {
		const stages = data.stack.stages ?? [];
		const items: Array<{ id: string; title: string }> = [];

		for (const stage of stages) {
			if (!canOpenStageDiff(stage.id)) {
				continue;
			}

			items.push({ id: stage.id, title: stage.title });
		}

		return items;
	}

	function moveToAdjacentDiff(direction: 1 | -1): void {
		const stages = orderedDiffableStages();
		if (stages.length <= 1) {
			return;
		}

		const activeIndex = stages.findIndex((stage) => stage.id === activeDiffStageId);
		if (activeIndex === -1) {
			return;
		}

		const nextIndex = activeIndex + direction;
		if (nextIndex < 0 || nextIndex >= stages.length) {
			return;
		}

		const next = stages[nextIndex];
		openStageDiff(next.id, next.title);
	}

	function scrollToDiffFile(filePath: string): void {
		if (typeof document === 'undefined') {
			return;
		}

		const targets = Array.from(document.querySelectorAll<HTMLElement>('[data-stage-diff-file-path]'));
		const target = targets.find((entry) => entry.dataset.stageDiffFilePath === filePath);
		target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	function handleWindowKeydown(event: KeyboardEvent): void {
		if (!isStageDiffPanelOpen) {
			return;
		}

		if (event.key === 'Escape') {
			event.preventDefault();
			closeStageDiffPanel();
			return;
		}

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			moveToAdjacentDiff(1);
			return;
		}

		if (event.key === 'ArrowUp') {
			event.preventDefault();
			moveToAdjacentDiff(-1);
			return;
		}

		if (event.key.toLowerCase() === 'j') {
			event.preventDefault();
			moveToAdjacentDiff(1);
			return;
		}

		if (event.key.toLowerCase() === 'k') {
			event.preventDefault();
			moveToAdjacentDiff(-1);
		}
	}

	async function startFeature(): Promise<void> {
		if (!canStartFeature()) {
			return;
		}

		startPending = true;
		startError = null;
		startSuccess = null;
		syncError = null;

		try {
			const response = await fetch(`/api/stacks/${data.stack.id}/start`, { method: 'POST' });
			const body = (await response.json()) as StartResponse;
			if (!response.ok) {
				throw new Error(body.error ?? 'Unable to start feature.');
			}

			const titledStage = body.stageTitle?.trim();
			const stageLabel = body.stageNumber
				? titledStage
					? `stage ${body.stageNumber}: ${titledStage}`
					: `stage ${body.stageNumber}`
				: 'next stage';
			const mode = body.startedNow ? `Started ${stageLabel}.` : `${stageLabel} is already running.`;
			const worktreeState = body.reusedWorktree ? 'Reused existing worktree.' : 'Created worktree.';
			const sessionState = body.reusedSession ? 'Reused implementation session.' : 'Created implementation session.';
			startSuccess = `${mode} ${worktreeState} ${sessionState}`;
			await invalidateAll();
		} catch (error) {
			startError = error instanceof Error ? error.message : 'Unable to start feature.';
		} finally {
			startPending = false;
		}
	}

	async function syncStack(): Promise<void> {
		if (!canSyncStack()) {
			return;
		}

		syncPending = true;
		syncError = null;
		syncSuccess = null;
		startError = null;

		try {
			const response = await fetch(`/api/stacks/${data.stack.id}/sync`, { method: 'POST' });
			const body = (await response.json()) as SyncStackResponse;
			if (!response.ok) {
				throw new Error(body.error?.message ?? 'Unable to sync stack.');
			}

			const rebased = body.result?.rebasedStages ?? 0;
			const skipped = body.result?.skippedStages ?? 0;
			syncSuccess = `Stack sync complete. Rebases: ${rebased}. Skipped: ${skipped}.`;
			await invalidateAll();
		} catch (error) {
			syncError = error instanceof Error ? error.message : 'Unable to sync stack.';
		} finally {
			syncPending = false;
		}
	}

	const activeStageDiff = $derived(activeDiffStageId ? stageDiffCache[activeDiffStageId] : null);
	const activeStageDiffError = $derived(activeDiffStageId ? stageDiffErrors[activeDiffStageId] : null);
	const activeStageDiffLoading = $derived(
		activeDiffStageId ? loadingDiffStageId === activeDiffStageId : false
	);
	const activeSelectedLineIds = $derived(
		activeDiffStageId ? selectedLineIdsForStage(activeDiffStageId) : []
	);
	const activeSelectedFilePath = $derived(
		activeDiffStageId ? selectedFilePathForStage(activeDiffStageId) : null
	);
	const activeSelectedSnippet = $derived(selectedSnippetForActiveStage());
	const activeStageDiffChatReply = $derived(
		activeDiffStageId ? stageDiffChatReplyByStageId[activeDiffStageId] : null
	);
	const activeStageDiffChatError = $derived(
		activeDiffStageId ? stageDiffChatErrorsByStageId[activeDiffStageId] : null
	);
	const activeStageDiffChatSending = $derived(
		activeDiffStageId ? stageDiffChatSendingByStageId[activeDiffStageId] === true : false
	);
	const activeDiffChatMessage = $derived(
		activeDiffStageId ? selectedDiffChatMessageByStageId[activeDiffStageId] ?? '' : ''
	);

	$effect(() => {
		if (typeof document === 'undefined') {
			return;
		}

		if (!isStageDiffPanelOpen) {
			return;
		}

		previousFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		previousBodyOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';

		queueMicrotask(() => {
			stageDiffCloseButton?.focus();
		});

		return () => {
			document.body.style.overflow = previousBodyOverflow;
			if (previousFocusedElement) {
				previousFocusedElement.focus();
			}
		};
	});
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<main class="stacked-shell mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-6">
	<div class="stacked-fade-in">
		<div class="mb-4 flex flex-wrap items-center justify-between gap-3 border-b stacked-divider pb-3">
			<a href={resolve('/')} class="stacked-link text-sm font-semibold">Back to features</a>
			<p class="text-xs stacked-subtle">Loaded {new Date(data.loadedAt).toLocaleString()}</p>
		</div>

		<div class="mb-4">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<h1 class="text-2xl font-semibold tracking-tight sm:text-3xl">{data.stack.name}</h1>
				<div class="flex flex-wrap items-center gap-2">
					<Badge rounded color={typeColor[data.stack.type]}>{typeLabel[data.stack.type]}</Badge>
					<Badge rounded color={statusColor[data.stack.status]}>{statusLabel[data.stack.status]}</Badge>
				</div>
			</div>
			<p class="mt-2 text-sm stacked-subtle">{data.stack.notes ?? 'No description provided for this feature yet.'}</p>
		</div>

		<div class="mb-4 border-b stacked-divider">
			<div class="flex flex-wrap gap-1.5">
				<Button size="sm" color={activeTab === 'plan' ? 'primary' : 'alternative'} onclick={() => (activeTab = 'plan')}>
					Plan
				</Button>
				<Button size="sm" color={activeTab === 'stack' ? 'primary' : 'alternative'} onclick={() => (activeTab = 'stack')}>
					Stack
				</Button>
			</div>
		</div>

		{#if activeTab === 'plan'}
			<div class="stacked-panel-elevated p-4">
				<PlanningChat
					stackId={data.stack.id}
					session={data.session}
					messages={data.messages}
					awaitingResponse={data.awaitingResponse}
				/>
			</div>
		{:else}
			<div class="space-y-4">
				{#if syncError}
					<div class="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
						{syncError}
					</div>
				{/if}

				{#if syncSuccess}
					<div class="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
						{syncSuccess}
					</div>
				{/if}

				{#if startError}
					<div class="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
						{startError}
					</div>
				{/if}

				{#if startSuccess}
					<div class="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
						{startSuccess}
					</div>
				{/if}

				<div class="stacked-panel-elevated p-4">
					<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
						<p class="text-xs font-semibold uppercase tracking-[0.16em] stacked-subtle">Implementation stages</p>
						<div class="flex flex-wrap items-center gap-2">
							<Button size="xs" color="alternative" onclick={syncStack} disabled={!canSyncStack()}>
								{syncStackButtonLabel()}
							</Button>
							<Button size="xs" color="primary" onclick={startFeature} disabled={!canStartFeature()}>
								{startButtonLabel()}
							</Button>
						</div>
					</div>
					{#if data.stack.stages && data.stack.stages.length > 0}
						<div class="space-y-2">
							{#each data.stack.stages as implementationStage (implementationStage.id)}
								{@const stageRuntime = implementationRuntimeByStageId[implementationStage.id]}
								{@const currentStageStatus = stageStatus(implementationStage.id, implementationStage.status)}
								{@const currentStagePullRequest = stagePullRequest(
									implementationStage.id,
									implementationStage.pullRequest
								)}
								{@const stageWorking = currentStageStatus === 'in-progress' && isStageAgentWorking(implementationStage.id)}
								{@const stageCanOpenDiff = canOpenStageDiff(implementationStage.id)}
								{@const stageDiffMeta = stageDiffability(implementationStage.id)}
								{@const stageSyncMeta = stageSyncMetadata(implementationStage.id)}
								<div class="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)] px-3 py-2">
									<div>
										<p class="text-sm font-medium text-[var(--stacked-text)]">{implementationStage.title}</p>
										{#if implementationStage.details}
											<p class="mt-1 text-xs stacked-subtle">{implementationStage.details}</p>
										{/if}
										{#if stageCanOpenDiff}
											<p class="mt-1 text-xs stacked-subtle">Branch: {stageDiffMeta.branchName}</p>
										{:else if currentStageStatus !== 'not-started'}
											<p class="mt-1 text-xs text-amber-300">
												{stageDiffMeta.reasonIfNotDiffable ?? 'Stage diff is unavailable.'}
											</p>
										{/if}
									</div>
									<div class="flex flex-wrap items-center justify-end gap-2">
										{#if stageSyncMeta.isOutOfSync}
											<Badge rounded border color="yellow" title={`Behind ${stageSyncMeta.baseRef ?? 'base'} by ${stageSyncMeta.behindBy} commit${stageSyncMeta.behindBy === 1 ? '' : 's'}`}>
												Out of sync
											</Badge>
										{/if}
										<Badge rounded border color={implementationStageColor(currentStageStatus)}>
											<span class="inline-flex items-center gap-1.5">
											{#if stageWorking}
												<Spinner
													size="4"
													currentFill="var(--stacked-accent)"
													currentColor="color-mix(in oklab, var(--stacked-border-soft) 82%, #9aa3b7 18%)"
													class="opacity-90"
												/>
											{/if}
											<span>{implementationStageLabel(currentStageStatus)}</span>
											</span>
										</Badge>
										{#if currentStagePullRequest?.url && currentStagePullRequest.number}
											<Badge rounded border color="purple">
												<a
													href={currentStagePullRequest.url}
													target="_blank"
													rel="noopener noreferrer"
													class="inline-flex items-center gap-1"
												>
													<CodePullRequestSolid class="h-3.5 w-3.5" aria-hidden="true" />
													<span>#{currentStagePullRequest.number}</span>
												</a>
											</Badge>
										{/if}
										{#if currentStagePullRequest}
											<Badge
												rounded
												border
												color="blue"
												title={`${currentStagePullRequest.commentCount ?? 0} comment${(currentStagePullRequest.commentCount ?? 0) === 1 ? '' : 's'}`}
											>
												<span class="inline-flex items-center gap-1">
													<span>{currentStagePullRequest.commentCount ?? 0}</span>
													<AnnotationSolid class="h-3.5 w-3.5" aria-hidden="true" />
												</span>
											</Badge>
										{/if}
										{#if currentStageStatus === 'in-progress' && stageRuntime}
											<p class="text-xs stacked-subtle whitespace-nowrap">
												{stageRuntime.todoCompleted}/{stageRuntime.todoTotal} Todos done
											</p>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<p class="text-sm stacked-subtle">Save a plan in planning chat to generate implementation stages.</p>
					{/if}
				</div>

				<div class="stacked-panel-elevated p-4">
					{#if data.stack.pullRequest}
						<p class="text-xs uppercase tracking-wide stacked-subtle">Current PR</p>
						<p class="mt-1 text-sm font-semibold text-[var(--stacked-text)]">
							#{data.stack.pullRequest.number} {data.stack.pullRequest.title}
						</p>
						<p class="mt-1 text-xs stacked-subtle">
							{data.stack.pullRequest.state}{data.stack.pullRequest.isDraft ? ' (draft)' : ''}
						</p>
						<Badge rounded color="blue" class="mt-1 w-fit">
							<span class="inline-flex items-center gap-1">
								<span>{data.stack.pullRequest.commentCount ?? 0}</span>
								<AnnotationSolid class="h-3.5 w-3.5" aria-hidden="true" />
							</span>
						</Badge>
						<Button
							href={data.stack.pullRequest?.url ?? '#'}
							target="_blank"
							rel="noopener noreferrer"
							color="alternative"
							size="sm"
							class="mt-2"
						>
							Open on GitHub
						</Button>
					{:else}
						<p class="text-sm stacked-subtle">No active PR for this branch yet.</p>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</main>

<div class={`stage-diff-drawer ${isStageDiffPanelOpen ? 'is-open' : ''}`} aria-hidden={!isStageDiffPanelOpen}>
	<button
		type="button"
		class="stage-diff-backdrop"
		onclick={closeStageDiffPanel}
		aria-label="Close stage diff panel"
		tabindex={isStageDiffPanelOpen ? 0 : -1}
	></button>
	<div
		class="stage-diff-panel stacked-panel"
		role="dialog"
		aria-modal="true"
		aria-labelledby="stage-diff-panel-title"
	>
		<div class="stage-diff-panel-header">
			<div>
				<p class="text-xs font-semibold uppercase tracking-[0.16em] stacked-subtle">Branch diff</p>
				<h2 id="stage-diff-panel-title" class="mt-1 text-lg font-semibold text-[var(--stacked-text)]">
					{activeDiffStageTitle ?? 'Stage diff'}
				</h2>
			</div>
			<button
				type="button"
				onclick={closeStageDiffPanel}
				bind:this={stageDiffCloseButton}
				class="rounded-md border border-[var(--stacked-border-soft)] px-2 py-1 text-xs font-semibold text-[var(--stacked-text-muted)] transition hover:text-[var(--stacked-text)]"
			>
				Close
			</button>
		</div>
		<div class="stage-diff-panel-body stacked-scroll">
			{#if !activeDiffStageId}
				<p class="text-sm stacked-subtle">Select a diffable implementation stage to load changes.</p>
			{:else if activeStageDiffLoading}
				<div class="rounded-lg border border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)] px-3 py-2 text-sm stacked-subtle">
					Loading stage diff...
				</div>
			{:else if activeStageDiffError}
				<div class="rounded-lg border border-red-500/45 bg-red-500/10 px-3 py-2 text-sm text-red-200">
					{activeStageDiffError}
				</div>
			{:else if activeStageDiff}
				<div class="stage-diff-modal-layout">
					<aside class="stage-diff-sidebar stacked-scroll">
						<div class="rounded-lg border border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)] px-3 py-3">
							<div class="mb-2 flex flex-wrap gap-2">
								<Badge rounded color="gray">Files {activeStageDiff.summary.filesChanged}</Badge>
								<Badge rounded color="green">+{activeStageDiff.summary.additions}</Badge>
								<Badge rounded color="red">-{activeStageDiff.summary.deletions}</Badge>
							</div>
							<p class="text-xs stacked-subtle">Comparing {activeStageDiff.baseRef} -> {activeStageDiff.targetRef}</p>
							<p class="mt-1 text-xs stacked-subtle">Use Arrow Up/Down or J/K to move between diffable stages.</p>
							{#if activeStageDiff.isTruncated}
								<div class="mt-2 rounded-md border border-amber-300/35 bg-amber-400/10 px-2 py-1.5 text-xs text-amber-200">
									Showing a truncated diff for performance.
									{#if activeStageDiff.truncation}
										{activeStageDiff.truncation.omittedFiles > 0
											? ` Omitted files: ${activeStageDiff.truncation.omittedFiles}.`
											: ''}
										{activeStageDiff.truncation.omittedLines > 0
											? ` Omitted lines: ${activeStageDiff.truncation.omittedLines}.`
											: ''}
									{/if}
								</div>
							{/if}
						</div>

						<div class="rounded-lg border border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)] p-2.5">
							<div class="mb-2 flex items-center justify-between gap-2">
								<p class="text-xs font-semibold uppercase tracking-[0.14em] stacked-subtle">Files</p>
							</div>
							<div class="stage-diff-sidebar-files">
								{#each activeStageDiff.files as file (`${file.path}:${file.additions}:${file.deletions}`)}
									<button
										type="button"
										onclick={() => scrollToDiffFile(file.path)}
										class="stage-diff-sidebar-file"
									>
										<span class="stage-diff-sidebar-file-path">{file.path}</span>
										<span class="stage-diff-sidebar-file-meta">+{file.additions} -{file.deletions}</span>
									</button>
								{/each}
							</div>
						</div>

						<div class="rounded-lg border border-[var(--stacked-border-soft)] bg-[var(--stacked-surface-elevated)]/65 p-2.5">
							<div class="flex flex-wrap items-center justify-between gap-2">
								<p class="text-xs font-semibold uppercase tracking-[0.15em] stacked-subtle">Selected lines</p>
								<div class="flex flex-wrap items-center gap-2">
									<Badge rounded color="purple">{activeSelectedLineIds.length} selected</Badge>
									{#if activeSelectedFilePath}
										<Badge rounded color="gray">{activeSelectedFilePath}</Badge>
									{/if}
									<Button
										size="xs"
										color="alternative"
										onclick={() => activeDiffStageId && clearSelectedLinesForStage(activeDiffStageId)}
										disabled={activeSelectedLineIds.length === 0 || activeStageDiffChatSending}
									>
										Clear selection
									</Button>
								</div>
							</div>
							<p class="mt-1 text-xs stacked-subtle">
								Click lines to select. Shift+click extends contiguous ranges in the same file.
							</p>
							<label class="mt-2 block text-xs stacked-subtle" for="stage-diff-chat-message">
								Focus prompt (optional)
							</label>
							<textarea
								id="stage-diff-chat-message"
								rows="2"
								value={activeDiffChatMessage}
								oninput={(event) => {
									if (!activeDiffStageId) {
										return;
									}

									selectedDiffChatMessageByStageId[activeDiffStageId] =
										(event.currentTarget as HTMLTextAreaElement).value;
								}}
								placeholder="What should the assistant focus on in these selected lines?"
								class="mt-1 w-full rounded-md border border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)] px-2 py-1.5 text-sm text-[var(--stacked-text)] outline-none transition focus:border-[var(--stacked-accent)]"
							></textarea>
							<div class="mt-2 flex flex-wrap items-center gap-2">
								<Button
									size="xs"
									color="primary"
									onclick={startFocusedDiffChat}
									disabled={!canStartFocusedDiffChat() || activeStageDiffChatSending}
								>
									{activeStageDiffChatSending ? 'Starting chat...' : 'Start focused chat'}
								</Button>
								{#if activeSelectedSnippet}
									<span class="text-xs stacked-subtle">Snippet ready ({activeSelectedSnippet.split('\n').length} lines)</span>
								{/if}
							</div>
							{#if activeStageDiffChatError}
								<div class="mt-2 rounded-md border border-red-500/45 bg-red-500/10 px-2 py-1.5 text-xs text-red-200">
									{activeStageDiffChatError}
								</div>
							{/if}
							{#if activeStageDiffChatReply}
								<div class="mt-2 rounded-md border border-emerald-400/35 bg-emerald-500/10 px-2 py-2 text-xs text-emerald-100">
									<p class="mb-1 font-semibold uppercase tracking-[0.12em]">Focused chat reply</p>
									<p class="whitespace-pre-wrap">{activeStageDiffChatReply}</p>
								</div>
							{/if}
						</div>
					</aside>

					<div class="stage-diff-main">
						{#if activeStageDiff.files.length === 0}
							<div class="rounded-lg border border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)] px-3 py-3 text-sm stacked-subtle">
								No committed changes found for this stage branch.
							</div>
						{:else}
							<StageDiffStructuredView
								diff={activeStageDiff}
								selectedLineIds={activeSelectedLineIds}
								onLinePress={applyStageLineSelection}
								showFileNav={false}
							/>
						{/if}
					</div>
				</div>
			{:else}
				<p class="text-sm stacked-subtle">Select a diffable implementation stage to load changes.</p>
			{/if}
		</div>
	</div>
</div>

<style>
	.stage-diff-drawer {
		position: fixed;
		inset: 0;
		z-index: 40;
		pointer-events: none;
	}

	.stage-diff-drawer.is-open {
		pointer-events: auto;
	}

	.stage-diff-backdrop {
		position: absolute;
		inset: 0;
		border: 0;
		background: rgba(4, 6, 10, 0.52);
		opacity: 0;
		transition: opacity 180ms ease;
	}

	.stage-diff-drawer.is-open .stage-diff-backdrop {
		opacity: 1;
	}

	.stage-diff-panel {
		position: absolute;
		inset: 1rem;
		display: flex;
		flex-direction: column;
		opacity: 0;
		transform: scale(0.985) translateY(8px);
		transition:
			opacity 170ms ease,
			transform 220ms cubic-bezier(0.16, 1, 0.3, 1);
		border-radius: 14px;
	}

	.stage-diff-drawer.is-open .stage-diff-panel {
		opacity: 1;
		transform: scale(1) translateY(0);
	}

	.stage-diff-panel-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 1rem;
		border-bottom: 1px solid var(--stacked-border-soft);
		position: sticky;
		top: 0;
		z-index: 1;
		background: color-mix(in oklab, var(--stacked-surface-elevated) 92%, transparent);
	}

	.stage-diff-panel-body {
		padding: 1rem;
		overflow: auto;
		overscroll-behavior: contain;
	}

	.stage-diff-modal-layout {
		display: grid;
		grid-template-columns: minmax(280px, 340px) minmax(0, 1fr);
		gap: 0.9rem;
		align-items: start;
	}

	.stage-diff-sidebar {
		position: sticky;
		top: 0;
		display: grid;
		gap: 0.75rem;
		max-height: calc(100dvh - 9.2rem);
		overflow: auto;
		padding-right: 0.2rem;
	}

	.stage-diff-main {
		min-width: 0;
	}

	.stage-diff-sidebar-files {
		display: grid;
		gap: 0.35rem;
	}

	.stage-diff-sidebar-file {
		display: grid;
		gap: 0.12rem;
		padding: 0.45rem 0.55rem;
		border-radius: 8px;
		border: 1px solid color-mix(in oklab, var(--stacked-border-soft) 88%, transparent);
		background: color-mix(in oklab, var(--stacked-surface-elevated) 80%, transparent);
		text-align: left;
		cursor: pointer;
		transition: border-color 130ms ease, transform 130ms ease;
	}

	.stage-diff-sidebar-file:hover {
		border-color: color-mix(in oklab, var(--stacked-accent) 42%, var(--stacked-border-soft));
		transform: translateY(-1px);
	}

	.stage-diff-sidebar-file-path {
		font-size: 0.73rem;
		color: var(--stacked-text);
		word-break: break-word;
	}

	.stage-diff-sidebar-file-meta {
		font-size: 0.68rem;
		color: var(--stacked-text-muted);
	}

	@media (max-width: 640px) {
		.stage-diff-panel {
			inset: 0;
			border-radius: 0;
		}

		.stage-diff-modal-layout {
			grid-template-columns: minmax(0, 1fr);
		}

		.stage-diff-sidebar {
			position: static;
			max-height: none;
			padding-right: 0;
		}
	}
</style>
