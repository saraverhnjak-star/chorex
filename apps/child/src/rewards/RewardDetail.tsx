import {
  confirmRewardReceived,
  useRewardDetail,
} from '@chorex/firebase-client';
import { RewardTransitionAction, RewardDetailBody } from '@chorex/ui';
export function RewardDetail({
  rewardId,
  authUid,
}: {
  rewardId: string;
  authUid: string | undefined;
}) {
  const state = useRewardDetail(rewardId, authUid);
  return (
    <RewardDetailBody
      loading={state.status === 'loading'}
      error={state.status === 'error'}
      missing={state.status === 'missing'}
      fromCache={
        (state.status === 'ready' || state.status === 'missing') &&
        state.fromCache
      }
      reward={state.status === 'ready' ? state.reward : undefined}
    >
      {state.status === 'ready' && state.reward.childUid === authUid ? (
        <RewardTransitionAction
          key={`${state.reward.id}:${authUid}`}
          reward={state.reward}
          submit={confirmRewardReceived}
          expectedStatus="AWAITING_CHILD_CONFIRMATION"
          actionLabel="Confirm received"
          confirmLabel="Confirm receipt"
          question="Confirm that you received this reward?"
          description="Confirm only when you have received your promised reward."
          success="Reward received"
        />
      ) : null}
    </RewardDetailBody>
  );
}
