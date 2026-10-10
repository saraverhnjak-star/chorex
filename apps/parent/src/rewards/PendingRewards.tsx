import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { EarnedReward } from '@chorex/domain';
import {
  useAwaitingRewards,
  usePendingRewards,
  useReceivedRewards,
} from '@chorex/firebase-client';
import { DesignText, homeTokens } from '@chorex/ui';
import { ParentRewardList } from './ParentRewardList';

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
  const pending = usePendingRewards(familyId, authUid);
  const awaiting = useAwaitingRewards(familyId, authUid);
  const received = useReceivedRewards(familyId, authUid);
  const router = useRouter();
  const [selectedStatus, setSelectedStatus] = useState<EarnedReward['status']>(
    'PENDING_FULFILLMENT',
  );
  const [tabsWidth, setTabsWidth] = useState(0);
  const tabs = [
    {
      status: 'PENDING_FULFILLMENT' as const,
      label: 'Waiting',
      empty: 'No rewards waiting for delivery',
      state: pending,
    },
    {
      status: 'AWAITING_CHILD_CONFIRMATION' as const,
      label: 'Delivered',
      empty: 'No rewards waiting for confirmation',
      state: awaiting,
    },
    {
      status: 'FULFILLED' as const,
      label: 'Received',
      empty: 'No received rewards yet',
      state: received,
    },
  ];
  const selected = tabs.find((tab) => tab.status === selectedStatus)!;
  const state = selected.state;
  return (
    <View style={{ gap: homeTokens.spacing.section }}>
      {!preview ? (
        <View
          testID="parent-reward-status-tabs"
          accessibilityRole="tablist"
          onLayout={({ nativeEvent }) => setTabsWidth(nativeEvent.layout.width)}
          style={{ flexDirection: 'row', gap: homeTokens.spacing.small }}
        >
          {tabs.map((tab) => (
            <Pressable
              key={tab.status}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: selectedStatus === tab.status }}
              onPress={() => setSelectedStatus(tab.status)}
              style={{
                flexGrow: 0,
                flexShrink: 0,
                width:
                  tabsWidth > 0
                    ? Math.max(
                        0,
                        (tabsWidth - homeTokens.spacing.small * 2) / 3,
                      )
                    : undefined,
                minWidth: 0,
                minHeight: 44,
                paddingHorizontal: homeTokens.spacing.small,
                paddingVertical: homeTokens.spacing.small,
                justifyContent: 'center',
                borderRadius: homeTokens.radius.pill,
                backgroundColor:
                  selectedStatus === tab.status
                    ? homeTokens.text
                    : homeTokens.surface,
                borderWidth: 1,
                borderColor:
                  selectedStatus === tab.status
                    ? homeTokens.text
                    : homeTokens.border,
              }}
            >
              <DesignText
                numberOfLines={1}
                style={{
                  textAlign: 'center',
                  fontSize: 16,
                  fontWeight: '600',
                  color:
                    selectedStatus === tab.status
                      ? homeTokens.surface
                      : homeTokens.secondary,
                }}
              >
                {tab.label}
              </DesignText>
            </Pressable>
          ))}
        </View>
      ) : null}
      <ParentRewardList
        showHeading={preview}
        onRetry={onRetry}
        preview={preview}
        onSeeAll={preview ? () => router.navigate('/rewards') : undefined}
        viewer="PARENT"
        title="Rewards"
        empty={selected.empty}
        loading={
          preview
            ? pending.status === 'loading' || awaiting.status === 'loading'
            : state.status === 'loading'
        }
        error={
          preview
            ? pending.status === 'error' || awaiting.status === 'error'
            : state.status === 'error'
        }
        fromCache={
          preview
            ? (pending.status === 'ready' && pending.fromCache) ||
              (awaiting.status === 'ready' && awaiting.fromCache)
            : state.status === 'ready' && state.fromCache
        }
        rewards={
          preview
            ? [
                ...(pending.status === 'ready' ? pending.rewards : []),
                ...(awaiting.status === 'ready' ? awaiting.rewards : []),
              ]
            : state.status === 'ready'
              ? state.rewards.filter(
                  (reward) => reward.status === selectedStatus,
                )
              : []
        }
        childNames={childNames}
        onSelect={(rewardId) =>
          router.push({ pathname: '/rewards/[rewardId]', params: { rewardId } })
        }
      />
    </View>
  );
}
export function PendingRewards(
  props: Parameters<typeof PendingRewardsContent>[0],
) {
  const [attempt, setAttempt] = useState(0);
  return (
    <PendingRewardsContent
      key={attempt}
      {...props}
      onRetry={() => setAttempt((value) => value + 1)}
    />
  );
}
