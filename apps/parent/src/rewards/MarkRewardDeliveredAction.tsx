import { t, useAppLanguage, RewardTransitionAction } from '@chorex/ui';
import type { EarnedReward } from '@chorex/domain';
import { markRewardDelivered } from '@chorex/firebase-client';
export function MarkRewardDeliveredAction({
  reward,
  childName,
}: {
  reward: EarnedReward;
  childName?: string;
}) {
  useAppLanguage();

  return (
    <RewardTransitionAction
      blue
      reward={reward}
      submit={markRewardDelivered}
      expectedStatus="PENDING_FULFILLMENT"
      actionLabel={t('Mark as delivered')}
      confirmLabel={t('Confirm delivery')}
      question={t('Record this reward as delivered?')}
      description={t(
        'This tells {0} that the reward was delivered. They will confirm when they receive it.',
        { '0': childName ?? t('your Child') },
      )}
      success={t('Waiting for child confirmation')}
    />
  );
}
