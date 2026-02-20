import type { FeatureStage, FeatureStageStatus, StackStatus } from '../../../../lib/types/stack';
import type { ImplementationStageRuntime } from './contracts';

export const typeLabel = {
	feature: 'Feature',
	bugfix: 'Bugfix',
	chore: 'Chore'
} as const;

export const typeClass = {
	feature: 'stacked-chip stacked-chip-review',
	bugfix: 'stacked-chip stacked-chip-danger',
	chore: 'stacked-chip'
} as const;

export const statusLabel: Record<StackStatus, string> = {
	created: 'Created',
	planned: 'Planned',
	started: 'Started',
	complete: 'Complete'
};

export const statusClass: Record<StackStatus, string> = {
	created: 'stacked-chip',
	planned: 'stacked-chip stacked-chip-warning',
	started: 'stacked-chip stacked-chip-review',
	complete: 'stacked-chip stacked-chip-success'
};

export function implementationStageClass(status: FeatureStageStatus): string {
	if (status === 'done') {
		return 'stacked-chip stacked-chip-success';
	}

	if (status === 'review-ready') {
		return 'stacked-chip stacked-chip-review';
	}

	if (status === 'in-progress') {
		return 'stacked-chip stacked-chip-warning';
	}

	return 'stacked-chip';
}

export function implementationStageLabel(status: FeatureStageStatus): string {
	if (status === 'done') {
		return 'Done';
	}

	if (status === 'review-ready') {
		return 'Review ready';
	}

	if (status === 'in-progress') {
		return 'In progress';
	}

	return 'Not started';
}

export function stageStatus(
	implementationRuntimeByStageId: Record<string, ImplementationStageRuntime>,
	stageId: string,
	fallback: FeatureStageStatus
): FeatureStageStatus {
	return implementationRuntimeByStageId[stageId]?.stageStatus ?? fallback;
}

export function stagePullRequest(
	implementationRuntimeByStageId: Record<string, ImplementationStageRuntime>,
	stageId: string,
	fallback: ImplementationStageRuntime['pullRequest']
): ImplementationStageRuntime['pullRequest'] {
	return implementationRuntimeByStageId[stageId]?.pullRequest ?? fallback;
}

export function hasInProgressStage(
	stages: FeatureStage[],
	implementationRuntimeByStageId: Record<string, ImplementationStageRuntime>
): boolean {
	return stages.some((stage) => stageStatus(implementationRuntimeByStageId, stage.id, stage.status) === 'in-progress');
}

export function hasRemainingNotStartedStage(
	stages: FeatureStage[],
	implementationRuntimeByStageId: Record<string, ImplementationStageRuntime>
): boolean {
	return stages.some((stage) => stageStatus(implementationRuntimeByStageId, stage.id, stage.status) === 'not-started');
}

export function canStartFeature(input: {
	stages: FeatureStage[];
	implementationRuntimeByStageId: Record<string, ImplementationStageRuntime>;
	startPending: boolean;
}): boolean {
	return (
		hasRemainingNotStartedStage(input.stages, input.implementationRuntimeByStageId) &&
		!hasInProgressStage(input.stages, input.implementationRuntimeByStageId) &&
		!input.startPending
	);
}

export function startButtonLabel(input: {
	stages: FeatureStage[];
	implementationRuntimeByStageId: Record<string, ImplementationStageRuntime>;
	startPending: boolean;
}): string {
	if (input.startPending) {
		return 'Starting...';
	}

	if (hasInProgressStage(input.stages, input.implementationRuntimeByStageId)) {
		return 'Start feature';
	}

	return 'Next stage';
}
