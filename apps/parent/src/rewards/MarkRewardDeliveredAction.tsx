import type { EarnedReward } from '@chorex/domain';
import { markRewardDelivered } from '@chorex/firebase-client';
import { RewardTransitionAction } from '@chorex/ui';
export function MarkRewardDeliveredAction({
  reward,
  childName,
}: {
  reward: EarnedReward;
  childName?: string;
}) {
  return (
    <RewardTransitionAction
      blue
      reward={reward}
      submit={markRewardDelivered}
      expectedStatus="PENDING_FULFILLMENT"
      actionLabel="Mark as delivered"
      confirmLabel="Confirm delivery"
      question="Record this reward as delivered?"
      description={`This tells ${childName ?? 'your Child'} that the reward was delivered. They will confirm when they receive it.`}
      success="Waiting for child confirmation"
    />
  );
}
