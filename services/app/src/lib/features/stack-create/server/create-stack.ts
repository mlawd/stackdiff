import { createStackWithPlanningBootstrap } from '$lib/server/stack-create-service';
import { enrichStackStatus } from '$lib/server/stack-status';
import type { StackUpsertInput, StackViewModel } from '$lib/types/stack';

export async function createStack(
  input: StackUpsertInput,
): Promise<StackViewModel> {
  const created = await createStackWithPlanningBootstrap(input);
  return enrichStackStatus(created);
}
