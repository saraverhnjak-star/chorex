import { useRouter } from 'expo-router';
import { useEarnedRewards } from '@chorex/firebase-client';
import { RewardList } from '@chorex/ui';
export function EarnedRewards({
  familyId,
  authUid,
}: {
  familyId: string;
  authUid: string;
}) {
  const state = useEarnedRewards(familyId, authUid),
    router = useRouter();
  return (
    <RewardList
      title="Earned rewards"
      empty="No rewards yet"
      loading={state.status === 'loading'}
      error={state.status === 'error'}
      fromCache={state.status === 'ready' && state.fromCache}
      rewards={state.status === 'ready' ? state.rewards : []}
      onSelect={(rewardId) =>
        router.push({ pathname: '/rewards/[rewardId]', params: { rewardId } })
      }
    />
  );
}
