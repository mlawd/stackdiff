<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { onMount } from 'svelte';

  import type { StackViewModel } from '$lib/types/stack';
  import { loadStageReviewSession } from '../api-client';
  import { stageStatus } from '../behavior';
  import type {
    ImplementationStageRuntime,
    ReviewSessionResponse,
  } from '../contracts';
  import {
    createFeatureActionsController,
    createInitialFeatureActionStateGroup,
  } from '../feature-actions-controller';
  import { createReviewReadyNotifier } from '../review-ready-notifier';
  import { createReviewSessionController } from '../review-session-controller';
  import { createRuntimeStreamController } from '../runtime-stream-controller';
  import FeatureActionAlerts from './FeatureActionAlerts.svelte';
  import FeatureImplementationSection from './FeatureImplementationSection.svelte';
  import FeatureReviewDialog from './FeatureReviewDialog.svelte';
  import FeatureStageDetailDialog from './FeatureStageDetailDialog.svelte';

  let {
    stack,
    hasSavedPlan,
    onOpenPlanningChat,
  }: {
    stack: StackViewModel;
    hasSavedPlan: boolean;
    onOpenPlanningChat: () => void;
  } = $props();

  let actionState = $state(createInitialFeatureActionStateGroup());
  let implementationRuntimeByStageId = $state<
    Record<string, ImplementationStageRuntime>
  >({});
  let reviewLoading = $state(false);
  let reviewError = $state<string | null>(null);
  let selectedStageId = $state<string | null>(null);
  let selectedReviewStageId = $state<string | null>(null);
  let reviewSession = $state<ReviewSessionResponse | null>(null);
  let streamConnectionState = $state<
    'connected' | 'reconnecting' | 'disconnected'
  >('reconnecting');
  let streamReconnectAttempt = $state(0);

  const reviewSessionController = createReviewSessionController({
    loadSession: loadStageReviewSession,
    setState: (nextState) => {
      selectedReviewStageId = nextState.selectedReviewStageId;
      reviewLoading = nextState.reviewLoading;
      reviewError = nextState.reviewError;
      reviewSession = nextState.reviewSession;
    },
  });

  const featureActionsController = createFeatureActionsController({
    getStack: () => stack,
    getImplementationRuntimeByStageId: () => implementationRuntimeByStageId,
    setImplementationRuntimeByStageId: (next) => {
      implementationRuntimeByStageId = next;
    },
    getActionState: () => actionState,
    setActionState: (nextState) => {
      actionState = nextState;
    },
    invalidate: () => invalidateAll(),
    confirmMergeDown: (message) => window.confirm(message),
  });

  let selectedReviewStage = $derived(
    selectedReviewStageId
      ? ((stack.stages ?? []).find(
          (stage) => stage.id === selectedReviewStageId,
        ) ?? null)
      : null,
  );

  let selectedStage = $derived(
    selectedStageId
      ? ((stack.stages ?? []).find((stage) => stage.id === selectedStageId) ??
          null)
      : null,
  );

  let selectedStageStatus = $derived(
    selectedStage
      ? stageStatus(
          implementationRuntimeByStageId,
          selectedStage.id,
          selectedStage.status,
        )
      : null,
  );

  onMount(() => {
    const reviewReadyNotifier = createReviewReadyNotifier(stack.id);
    const runtimeStreamController = createRuntimeStreamController({
      stackId: stack.id,
      onSnapshot: (runtimeByStageId) => {
        implementationRuntimeByStageId = runtimeByStageId;
      },
      onStageRuntime: (stageId, runtime) => {
        implementationRuntimeByStageId = {
          ...implementationRuntimeByStageId,
          [stageId]: runtime,
        };
      },
      onReviewReady: (stageId, stageTitle) => {
        reviewReadyNotifier.notify(stageId, stageTitle);
      },
      onConnectionStateChange: (state, reconnectAttempt) => {
        streamConnectionState = state;
        streamReconnectAttempt = reconnectAttempt;
      },
    });
    runtimeStreamController.start();

    return () => {
      runtimeStreamController.stop();
    };
  });

  async function openReviewStage(stageId: string): Promise<void> {
    await reviewSessionController.open({ stackId: stack.id, stageId });
  }

  function closeReviewStage(): void {
    reviewSessionController.close();
  }

  function openStage(stageId: string): void {
    selectedStageId = stageId;
  }

  function closeStage(): void {
    selectedStageId = null;
  }
</script>

<div class="space-y-4">
  <FeatureActionAlerts
    syncError={actionState.syncAction.error}
    syncSuccess={actionState.syncAction.success}
    mergeDownError={actionState.mergeDownAction.error}
    mergeDownSuccess={actionState.mergeDownAction.success}
    startError={actionState.startAction.error}
    startSuccess={actionState.startAction.success}
  />

  <FeatureImplementationSection
    {hasSavedPlan}
    stages={stack.stages ?? []}
    stageSyncById={stack.stageSyncById}
    {implementationRuntimeByStageId}
    startAction={actionState.startAction}
    syncAction={actionState.syncAction}
    mergeDownAction={actionState.mergeDownAction}
    canStartFeature={featureActionsController.canStartFeature()}
    canSyncStack={featureActionsController.canSyncStack()}
    canMergeDown={featureActionsController.canMergeDown()}
    startButtonLabel={featureActionsController.startButtonLabel()}
    {streamConnectionState}
    {streamReconnectAttempt}
    {onOpenPlanningChat}
    onStartFeature={featureActionsController.startFeature}
    onSyncStack={featureActionsController.syncStack}
    onMergeDown={featureActionsController.mergeDownStack}
    onOpenStage={openStage}
  />
</div>

<FeatureReviewDialog
  open={Boolean(selectedReviewStageId)}
  stackId={stack.id}
  stageId={selectedReviewStageId}
  stageTitle={selectedReviewStage?.title ?? null}
  {reviewLoading}
  {reviewError}
  {reviewSession}
  onClose={closeReviewStage}
/>

<FeatureStageDetailDialog
  open={Boolean(selectedStage)}
  stackName={stack.name}
  stage={selectedStage}
  status={selectedStageStatus}
  onClose={closeStage}
/>
