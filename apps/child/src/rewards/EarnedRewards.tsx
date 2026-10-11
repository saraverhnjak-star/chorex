import { useRouter } from 'expo-router';
import { useLayoutEffect, useState } from 'react';
import { useEarnedRewards } from '@chorex/firebase-client';
import { RewardList } from '@chorex/ui';
function EarnedRewardsContent({
  familyId,
  authUid,
  preview = false,
  onRetry,
  onEmptyChange,
  onLoadingChange,
}: {
  onRetry?: () => void;
  onEmptyChange?: (empty: boolean) => void;
  onLoadingChange?: (loading: boolean) => void;
  preview?: boolean;
  familyId: string;
  authUid: string;
}) {
  const state = useEarnedRewards(familyId, authUid),
    router = useRouter();
  const empty = state.status === 'ready' && state.rewards.length === 0;
  useLayoutEffect(() => {
    onEmptyChange?.(empty);
  }, [empty, onEmptyChange]);
  useLayoutEffect(() => {
    onLoadingChange?.(state.status === 'loading');
  }, [state.status, onLoadingChange]);
  if (preview && empty) return null;
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
