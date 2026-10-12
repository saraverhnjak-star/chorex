import {
  t,
  useAppLanguage,
  RewardTransitionAction,
  RewardDetailBody,
} from '@chorex/ui';
import {
  confirmRewardReceived,
  useRewardDetail,
} from '@chorex/firebase-client';
export function RewardDetail({
  rewardId,
  authUid,
}: {
  rewardId: string;
  authUid: string | undefined;
}) {
  useAppLanguage();

  const state = useRewardDetail(rewardId, authUid);
  if (state.status === 'loading') return null;
  return (
    <RewardDetailBody
      loading={false}
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
          green
          key={`${state.reward.id}:${authUid}`}
          reward={state.reward}
          submit={confirmRewardReceived}
          expectedStatus="AWAITING_CHILD_CONFIRMATION"
          actionLabel={t('Confirm received')}
          confirmLabel={t('Confirm receipt')}
          question={t('Confirm that you received this reward?')}
          description={t(
            'Confirm only when you have received your promised reward.',
          )}
          success={t('Reward received')}
        />
      ) : null}
    </RewardDetailBody>
  );
}
