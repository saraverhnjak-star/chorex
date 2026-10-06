import { useRewardDetail } from '@chorex/firebase-client';
import { RewardDetailBody } from '@chorex/ui';
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
    />
  );
}
