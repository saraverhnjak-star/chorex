import { useState, type ReactNode } from 'react';
import { HomeFeatureCard, HomeCardAction } from './HomeFeatureCard';
import { Button } from './Button';
import { Pressable, View } from 'react-native';
import type { EarnedReward, UserProfile } from '@chorex/domain';
import { FormMessage } from './FormMessage';
import {
  HomeListRow,
  CountBadge,
  DesignText,
  homeTokens,
  CollectionHeading,
} from './Home';
import { SurfaceCard, OfferOutcome } from './OfferTerms';
import { RewardCard } from './RewardPresentation';
export function RewardList({
  title,
  empty,
  loading,
  error,
  fromCache,
  rewards,
  onSelect,
  childNames = {},
  viewer = 'CHILD',
  preview = false,
  onSeeAll,
  onRetry,
}: {
  preview?: boolean;
  onSeeAll?: () => void;
  onRetry?: () => void;
  title: string;
  empty: string;
  loading: boolean;
  error: boolean;
  fromCache: boolean;
  rewards: readonly EarnedReward[];
  onSelect: (id: string) => void;
  childNames?: Readonly<Record<string, string>>;
  viewer?: UserProfile['accountType'];
}) {
  const [selectedStatus, setSelectedStatus] = useState<EarnedReward['status']>(
    'PENDING_FULFILLMENT',
  );
  const [tabsWidth, setTabsWidth] = useState(0);
  const statusTabs = [
    { status: 'PENDING_FULFILLMENT', label: 'Waiting' },
    { status: 'AWAITING_CHILD_CONFIRMATION', label: 'Delivered' },
    { status: 'FULFILLED', label: 'Received' },
  ] as const;
  const visible = preview
    ? (viewer === 'CHILD'
        ? [
            ...rewards.filter(
              (reward) => reward.status === 'AWAITING_CHILD_CONFIRMATION',
            ),
            ...rewards.filter(
              (reward) => reward.status !== 'AWAITING_CHILD_CONFIRMATION',
            ),
          ]
        : rewards
      ).slice(0, 2)
    : rewards;
  const filteredRewards =
    viewer === 'CHILD' && !preview
      ? visible.filter((reward) => reward.status === selectedStatus)
      : visible;
  const groups = [{ label: undefined, rewards: filteredRewards }];
  if (preview)
    return (
      <View style={{ gap: homeTokens.spacing.medium }}>
        <CollectionHeading label="See all Rewards" onSeeAll={onSeeAll}>
          {title}
        </CollectionHeading>
        {fromCache ? (
          <DesignText style={{ fontSize: 12, color: homeTokens.secondary }}>
            Showing saved rewards. Updates may be pending.
          </DesignText>
        ) : null}
        {loading ? (
          <DesignText style={{ fontSize: 14, color: homeTokens.secondary }}>
            Loading rewards…
          </DesignText>
        ) : null}
        {error ? (
          <>
            <FormMessage message="Your rewards could not be loaded. Try again." />
            {onRetry ? (
              <Button
                variant="outline"
                label="Try Rewards again"
                onPress={onRetry}
              />
            ) : null}
          </>
        ) : null}
        {!loading && !error && rewards.length === 0 ? (
          <DesignText style={{ fontSize: 14, color: homeTokens.secondary }}>
            {fromCache ? 'No rewards saved yet.' : empty}
          </DesignText>
        ) : null}
        {visible
          .slice(0, 1)
          .map((reward) =>
            viewer === 'CHILD' ? (
              <ChildRewardCard
                key={reward.id}
                reward={reward}
                onSelect={onSelect}
              />
            ) : (
              <HomeListRow
                key={reward.id}
                title={reward.terms.title}
                detail={
                  reward.status === 'PENDING_FULFILLMENT'
                    ? 'Earned · Waiting for Parent delivery'
                    : reward.status === 'AWAITING_CHILD_CONFIRMATION'
                      ? 'Delivered · Confirm when received'
                      : 'Received · Receipt confirmed'
                }
                reward={reward.terms}
                label={`Open reward: ${childNames[reward.childUid] ? `${childNames[reward.childUid]} · ` : ''}${reward.terms.title}`}
                onPress={() => onSelect(reward.id)}
              />
            ),
          )}
      </View>
    );
  const Wrapper = viewer === 'CHILD' ? ChildRewardCollection : SurfaceCard;
  return (
    <Wrapper>
      {viewer === 'CHILD' ? (
        <View
          testID="reward-status-tabs"
          accessibilityRole="tablist"
          onLayout={({ nativeEvent }) => setTabsWidth(nativeEvent.layout.width)}
          style={{
            flexDirection: 'row',
            gap: homeTokens.spacing.small,
          }}
        >
          {statusTabs.map((tab) => (
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
                minHeight: 48,
                paddingHorizontal: homeTokens.spacing.small,
                paddingVertical: homeTokens.spacing.small,
                justifyContent: 'center',
                borderRadius: homeTokens.radius.card,
                backgroundColor:
                  selectedStatus === tab.status
                    ? homeTokens.mint
                    : homeTokens.surface,
                borderWidth: 1,
                borderColor:
                  selectedStatus === tab.status
                    ? homeTokens.success
                    : homeTokens.border,
              }}
            >
              <DesignText
                numberOfLines={1}
                style={{
                  textAlign: 'center',
                  fontSize: 14,
                  fontWeight: '600',
                  color: homeTokens.text,
                }}
              >
                {tab.label}
              </DesignText>
            </Pressable>
          ))}
        </View>
      ) : (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: homeTokens.spacing.small,
          }}
        >
          <View style={{ flex: 1 }}>
            <CollectionHeading label="See all Rewards" onSeeAll={onSeeAll}>
              {title}
            </CollectionHeading>
          </View>
          {!loading && !error ? <CountBadge count={rewards.length} /> : null}
        </View>
      )}
      {loading ? (
        <DesignText
          accessibilityLiveRegion="polite"
          style={{ fontSize: 16, color: homeTokens.secondary }}
        >
          Loading rewards…
        </DesignText>
      ) : null}
      {error ? (
        <>
          <FormMessage message="Your rewards could not be loaded. Try again." />
          {onRetry ? (
            <Button
              variant="outline"
              label="Try Rewards again"
              onPress={onRetry}
            />
          ) : null}
        </>
      ) : null}
      {fromCache ? (
        <DesignText style={{ fontSize: 14, color: homeTokens.secondary }}>
          Showing saved rewards. Updates may be pending.
        </DesignText>
      ) : null}
      {!loading && !error && rewards.length === 0 ? (
        <OfferOutcome
          title={fromCache ? 'No rewards are saved on this device yet.' : empty}
        >
          {viewer === 'CHILD'
            ? 'Your earned rewards will appear here.'
            : undefined}
        </OfferOutcome>
      ) : null}
      {!loading &&
      !error &&
      rewards.length > 0 &&
      filteredRewards.length === 0 ? (
        <OfferOutcome title="No rewards in this status" />
      ) : null}
      {groups.map((group) => (
        <View
          key={group.label ?? 'rewards'}
          style={{
            gap: homeTokens.spacing.medium,
            marginTop: viewer === 'CHILD' ? homeTokens.spacing.medium : 0,
          }}
        >
          {group.rewards.map((reward) =>
            viewer === 'CHILD' ? (
              <ChildRewardCard
                key={reward.id}
                reward={reward}
                onSelect={onSelect}
              />
            ) : (
              <RewardCard
                key={reward.id}
                reward={reward}
                viewer={viewer}
                childName={childNames[reward.childUid]}
                onPress={() => onSelect(reward.id)}
              />
            ),
          )}
        </View>
      ))}
    </Wrapper>
  );
}

function ChildRewardCard({
  reward,
  onSelect,
}: {
  reward: EarnedReward;
  onSelect: (id: string) => void;
}) {
  return (
    <HomeFeatureCard
      key={reward.id}
      title={reward.terms.title}
      reward={reward.terms}
      tone="mint"
      badge={
        reward.status === 'PENDING_FULFILLMENT'
          ? 'Earned'
          : reward.status === 'AWAITING_CHILD_CONFIRMATION'
            ? 'Delivered'
            : 'Received'
      }
      detail={
        reward.status === 'PENDING_FULFILLMENT'
          ? 'Waiting for Parent delivery'
          : reward.status === 'AWAITING_CHILD_CONFIRMATION'
            ? 'Confirm when received'
            : 'Receipt confirmed'
      }
    >
      <HomeCardAction
        label={`Open reward: ${reward.terms.title}`}
        tone="green"
        onPress={() => onSelect(reward.id)}
      />
    </HomeFeatureCard>
  );
}

function ChildRewardCollection({ children }: { children: ReactNode }) {
  return <View style={{ gap: homeTokens.spacing.medium }}>{children}</View>;
}
