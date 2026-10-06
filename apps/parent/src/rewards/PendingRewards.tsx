import { useRouter } from 'expo-router';
import { usePendingRewards } from '@chorex/firebase-client';
import { RewardList } from '@chorex/ui';
export function PendingRewards({
  familyId,
  authUid,
  childNames = {},
}: {
  familyId: string;
  authUid: string;
  childNames?: Readonly<Record<string, string>>;
}) {
  const state = usePendingRewards(familyId, authUid),
    router = useRouter();
  return (
    <RewardList
      title="Rewards to fulfill"
      empty="No rewards waiting to be fulfilled"
      loading={state.status === 'loading'}
      error={state.status === 'error'}
      fromCache={state.status === 'ready' && state.fromCache}
      rewards={state.status === 'ready' ? state.rewards : []}
      childNames={childNames}
      onSelect={(rewardId) =>
        router.push({ pathname: '/rewards/[rewardId]', params: { rewardId } })
      }
    />
  );
}
