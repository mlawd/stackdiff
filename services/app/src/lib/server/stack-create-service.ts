import { createAndSeedPlanningSessionForStack } from '$lib/server/planning-service';
import { createStack, deleteStack } from '$lib/server/stack-store';
import type { StackMetadata, StackUpsertInput } from '$lib/types/stack';

export async function createStackWithPlanningBootstrap(
  input: StackUpsertInput,
): Promise<StackMetadata> {
  const created = await createStack(input);

  try {
    await createAndSeedPlanningSessionForStack(created);
    return created;
  } catch (error) {
    try {
      await deleteStack(created.id);
    } catch {
      // Preserve the original bootstrap error.
    }

    throw error;
  }
}
