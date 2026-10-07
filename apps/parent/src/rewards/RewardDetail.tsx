import { useRewardDetail } from '@chorex/firebase-client';
import { RewardDetailBody } from '@chorex/ui';
import { MarkRewardDeliveredAction } from './MarkRewardDeliveredAction';
export function RewardDetail({
  rewardId,
  authUid,
  childNames = {},
}: {
  rewardId: string;
  authUid: string | undefined;
  childNames?: Readonly<Record<string, string>>;
}) {
  const state = useRewardDetail(rewardId, authUid);
  return (
    <RewardDetailBody
      viewer="PARENT"
      loading={state.status === 'loading'}
      error={state.status === 'error'}
      missing={state.status === 'missing'}
      fromCache={
        (state.status === 'ready' || state.status === 'missing') &&
        state.fromCache
      }
      reward={state.status === 'ready' ? state.reward : undefined}
      childName={
        state.status === 'ready' ? childNames[state.reward.childUid] : undefined
      }
    >
      {state.status === 'ready' && state.reward.parentUid === authUid ? (
        <MarkRewardDeliveredAction
          key={`${state.reward.id}:${authUid}`}
          reward={state.reward}
          childName={childNames[state.reward.childUid]}
        />
      ) : null}
    </RewardDetailBody>
  );
}
