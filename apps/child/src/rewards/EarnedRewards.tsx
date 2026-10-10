import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useEarnedRewards } from '@chorex/firebase-client';
import { RewardList } from '@chorex/ui';
function EarnedRewardsContent({
  familyId,
  authUid,
  preview = false,
  onRetry,
}: {
  onRetry?: () => void;
  preview?: boolean;
  familyId: string;
  authUid: string;
}) {
  const state = useEarnedRewards(familyId, authUid),
    router = useRouter();
  return (
    <RewardList
      onRetry={onRetry}
      preview={preview}
      onSeeAll={preview ? () => router.navigate('/rewards') : undefined}
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

export function EarnedRewards(
  props: Parameters<typeof EarnedRewardsContent>[0],
) {
  const [attempt, setAttempt] = useState(0);
  return (
    <>
      <EarnedRewardsContent
        key={attempt}
        {...props}
        onRetry={() => setAttempt((value) => value + 1)}
      />
    </>
  );
}
