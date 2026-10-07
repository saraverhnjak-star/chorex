import { useRouter } from 'expo-router';
import { useAwaitingRewards, usePendingRewards } from '@chorex/firebase-client';
import { RewardList, DesignText, homeTokens } from '@chorex/ui';
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
  const awaiting = useAwaitingRewards(familyId, authUid);
  return (
    <>
      <RewardList
        viewer="PARENT"
        title="Rewards to deliver"
        empty="No rewards waiting for delivery"
        loading={state.status === 'loading'}
        error={state.status === 'error'}
        fromCache={state.status === 'ready' && state.fromCache}
        rewards={state.status === 'ready' ? state.rewards : []}
        childNames={childNames}
        onSelect={(rewardId) =>
          router.push({ pathname: '/rewards/[rewardId]', params: { rewardId } })
        }
      />
      {awaiting.status === 'ready' &&
      awaiting.rewards.length === 0 &&
      !awaiting.fromCache ? (
        <DesignText style={{ fontSize: 14, color: homeTokens.secondary }}>
          No rewards waiting for confirmation
        </DesignText>
      ) : (
        <RewardList
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
      )}
    </>
  );
}
