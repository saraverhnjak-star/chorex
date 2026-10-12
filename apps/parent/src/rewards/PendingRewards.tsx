import {
  t,
  useAppLanguage,
  StatusTabs,
  DesignText,
  DesignIcon,
  homeTokens,
} from '@chorex/ui';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { EarnedReward } from '@chorex/domain';
import {
  useAwaitingRewards,
  usePendingRewards,
  useReceivedRewards,
} from '@chorex/firebase-client';
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
  useAppLanguage();

  const pending = usePendingRewards(familyId, authUid);
  const awaiting = useAwaitingRewards(familyId, authUid);
  const received = useReceivedRewards(familyId, authUid);
  const router = useRouter();
  const [selectedStatus, setSelectedStatus] = useState<EarnedReward['status']>(
    'PENDING_FULFILLMENT',
  );
  const [archiveExpanded, setArchiveExpanded] = useState(false);
  const archive =
    received.status === 'ready'
      ? received.rewards
          .filter((reward) => reward.status === 'FULFILLED')
          .sort((a, b) => Date.parse(b.fulfilledAt) - Date.parse(a.fulfilledAt))
      : [];
  const tabs = [
    {
      status: 'PENDING_FULFILLMENT' as const,
      label: 'To fulfill',
      empty: 'No rewards waiting for delivery',
      state: pending,
    },
    {
      status: 'AWAITING_CHILD_CONFIRMATION' as const,
      label: 'Kids turn',
      empty: 'No rewards waiting for confirmation',
      state: awaiting,
    },
  ];
  const selected = tabs.find((tab) => tab.status === selectedStatus)!;
  const state = selected.state;
  if (
    pending.status === 'loading' ||
    awaiting.status === 'loading' ||
    received.status === 'loading'
  )
    return null;
  return (
    <View
      style={{
        gap: homeTokens.spacing.section,
        flexGrow: preview ? undefined : 1,
      }}
    >
      {!preview ? (
        <StatusTabs
          testID="parent-reward-status-tabs"
          tone="neutral"
          labels={tabs.map((tab) => tab.label)}
          selected={selected.label}
          onSelect={(label) =>
            setSelectedStatus(tabs.find((tab) => tab.label === label)!.status)
          }
          counts={Object.fromEntries(
            tabs.map((tab) => [
              tab.label,
              tab.state.status === 'ready'
                ? tab.state.rewards.filter(
                    (reward) => reward.status === tab.status,
                  ).length
                : 0,
            ]),
          )}
        />
      ) : null}
      <ParentRewardList
        showHeading={preview}
        onRetry={onRetry}
        preview={preview}
        onSeeAll={preview ? () => router.navigate('/rewards') : undefined}
        viewer="PARENT"
        title={t('Rewards')}
        empty={t(selected.empty)}
        loading={false}
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
      {!preview ? (
        <View
          style={{
            gap: homeTokens.spacing.medium,
            marginTop: 'auto',
            paddingTop: homeTokens.spacing.section,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Reward archive')}
            accessibilityState={{ expanded: archiveExpanded }}
            onPress={() => setArchiveExpanded((value) => !value)}
            style={{
              minHeight: 44,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <DesignText style={{ fontSize: 16, color: homeTokens.secondary }}>
              {t('Reward archive')} ({archive.length})
            </DesignText>
            <DesignIcon
              accessible={false}
              name={archiveExpanded ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={homeTokens.secondary}
            />
          </Pressable>
          {archiveExpanded ? (
            <ParentRewardList
              showHeading={false}
              onRetry={onRetry}
              viewer="PARENT"
              title={t('Reward archive')}
              empty={t('No received rewards yet')}
              loading={false}
              error={received.status === 'error'}
              fromCache={received.status === 'ready' && received.fromCache}
              rewards={archive}
              childNames={childNames}
              onSelect={(rewardId) =>
                router.push({
                  pathname: '/rewards/[rewardId]',
                  params: { rewardId },
                })
              }
            />
          ) : null}
        </View>
      ) : null}
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
