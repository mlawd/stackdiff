import type { ReviewSessionResponse } from './contracts';

export interface ReviewSessionState {
  selectedReviewStageId: string | null;
  reviewLoading: boolean;
  reviewError: string | null;
  reviewSession: ReviewSessionResponse | null;
}

export interface ReviewSessionController {
  open: (input: { stackId: string; stageId: string }) => Promise<void>;
  close: () => void;
}

export function createInitialReviewSessionState(): ReviewSessionState {
  return {
    selectedReviewStageId: null,
    reviewLoading: false,
    reviewError: null,
    reviewSession: null,
  };
}

function toReviewSessionError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unable to open review session.';
}

export function createReviewSessionController(input: {
  loadSession: (
    stackId: string,
    stageId: string,
  ) => Promise<ReviewSessionResponse>;
  setState: (nextState: ReviewSessionState) => void;
}): ReviewSessionController {
  let requestToken = 0;

  async function open(nextInput: {
    stackId: string;
    stageId: string;
  }): Promise<void> {
    const { stackId, stageId } = nextInput;
    const token = ++requestToken;
    input.setState({
      selectedReviewStageId: stageId,
      reviewLoading: true,
      reviewError: null,
      reviewSession: null,
    });

    try {
      const session = await input.loadSession(stackId, stageId);
      if (token !== requestToken) {
        return;
      }

      input.setState({
        selectedReviewStageId: stageId,
        reviewLoading: false,
        reviewError: null,
        reviewSession: session,
      });
    } catch (error) {
      if (token !== requestToken) {
        return;
      }

      input.setState({
        selectedReviewStageId: stageId,
        reviewLoading: false,
        reviewError: toReviewSessionError(error),
        reviewSession: null,
      });
    }
  }

  function close(): void {
    requestToken += 1;
    input.setState(createInitialReviewSessionState());
  }

  return {
    open,
    close,
  };
}
