import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useAwaitingRewards, usePendingRewards } from '@chorex/firebase-client';
import { RewardList, DesignText, homeTokens } from '@chorex/ui';
function PendingRewardsContent({
  familyId,
  authUid,
  preview = false,
  onRetry,
  childNames = {},
}: {
  onRetry?: () => void;
  preview?: boolean;
  familyId: string;
  authUid: string;
  childNames?: Readonly<Record<string, string>>;
}) {
  const state = usePendingRewards(familyId, authUid),
    router = useRouter();
  const awaiting = useAwaitingRewards(familyId, authUid);
  return (
    <>
      <RewardList
        onRetry={onRetry}
        preview={preview}
        onSeeAll={preview ? () => router.navigate('/rewards') : undefined}
        viewer="PARENT"
        title={preview ? 'Rewards' : 'Rewards to deliver'}
        empty="No rewards waiting for delivery"
        loading={
          state.status === 'loading' ||
          (preview && awaiting.status === 'loading')
        }
        error={
          state.status === 'error' || (preview && awaiting.status === 'error')
        }
        fromCache={
          (state.status === 'ready' && state.fromCache) ||
          (preview && awaiting.status === 'ready' && awaiting.fromCache)
        }
        rewards={[
          ...(state.status === 'ready' ? state.rewards : []),
          ...(preview && awaiting.status === 'ready' ? awaiting.rewards : []),
        ]}
        childNames={childNames}
        onSelect={(rewardId) =>
          router.push({ pathname: '/rewards/[rewardId]', params: { rewardId } })
        }
      />
      {!preview ? (
        awaiting.status === 'ready' &&
        awaiting.rewards.length === 0 &&
        !awaiting.fromCache ? (
          <DesignText style={{ fontSize: 14, color: homeTokens.secondary }}>
            No rewards waiting for confirmation
          </DesignText>
        ) : (
          <RewardList
            onRetry={onRetry}
            viewer="PARENT"
            title="Waiting for child confirmation"
            empty="No rewards waiting for confirmation"
            loading={awaiting.status === 'loading'}
            error={awaiting.status === 'error'}
            fromCache={awaiting.status === 'ready' && awaiting.fromCache}
            rewards={awaiting.status === 'ready' ? awaiting.rewards : []}
            childNames={childNames}
            onSelect={(rewardId) =>
              router.push({
                pathname: '/rewards/[rewardId]',
                params: { rewardId },
              })
            }
          />
        )
      ) : null}
    </>
  );
}

export function PendingRewards(
  props: Parameters<typeof PendingRewardsContent>[0],
) {
  const [attempt, setAttempt] = useState(0);
  return (
    <>
      <PendingRewardsContent
        key={attempt}
        {...props}
        onRetry={() => setAttempt((value) => value + 1)}
      />
    </>
  );
}
