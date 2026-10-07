import type { EarnedReward } from '@chorex/domain';
import { markRewardDelivered } from '@chorex/firebase-client';
import { RewardTransitionAction } from '@chorex/ui';
export function MarkRewardDeliveredAction({
  reward,
}: {
  reward: EarnedReward;
}) {
  return (
    <RewardTransitionAction
      reward={reward}
      submit={markRewardDelivered}
      expectedStatus="PENDING_FULFILLMENT"
      actionLabel="Mark as delivered"
      confirmLabel="Confirm delivery"
      question="Record this reward as delivered?"
      description="Confirm that you delivered the promised reward. Your child will confirm receipt separately."
      success="Waiting for child confirmation"
    />
  );
}
