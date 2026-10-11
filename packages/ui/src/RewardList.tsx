import { StatusTabs } from './StatusTabs';
import { useState, type ReactNode } from 'react';
import { HomeFeatureCard, HomeCardAction } from './HomeFeatureCard';
import { Button } from './Button';
import { View } from 'react-native';
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
  rewards: allRewards,
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
    'AWAITING_CHILD_CONFIRMATION',
  );
  const statusTabs = [
    { status: 'AWAITING_CHILD_CONFIRMATION', label: 'Your turn' },
    { status: 'PENDING_FULFILLMENT', label: "Parent's turn" },
  ] as const;
  const rewards =
    viewer === 'CHILD'
      ? allRewards.filter((reward) => reward.status !== 'FULFILLED')
      : allRewards;
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
  if (loading) return null;
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
        <StatusTabs
          testID="reward-status-tabs"
          tone="green"
          labels={statusTabs.map((tab) => tab.label)}
          selected={
            statusTabs.find((tab) => tab.status === selectedStatus)!.label
          }
          onSelect={(label) =>
            setSelectedStatus(
              statusTabs.find((tab) => tab.label === label)!.status,
            )
          }
          counts={Object.fromEntries(
            statusTabs.map((tab) => [
              tab.label,
              rewards.filter((reward) => reward.status === tab.status).length,
            ]),
          )}
        />
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
          centered={viewer === 'CHILD'}
          illustration={viewer === 'CHILD' ? 'no-rewards' : undefined}
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
        <OfferOutcome
          title="No rewards in this status"
          centered
          illustration="no-rewards"
        />
      ) : null}
      {groups
        .filter((group) => group.rewards.length > 0)
        .map((group) => (
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
  return (
    <View style={{ gap: homeTokens.spacing.medium, flexGrow: 1 }}>
      {children}
    </View>
  );
}
