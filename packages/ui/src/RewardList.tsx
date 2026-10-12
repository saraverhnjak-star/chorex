import { t, useAppLanguage } from './localization';
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
  useAppLanguage();

  const [selectedStatus, setSelectedStatus] = useState<EarnedReward['status']>(
    'AWAITING_CHILD_CONFIRMATION',
  );
  const statusTabs = [
    { status: 'PENDING_FULFILLMENT', label: "Parent's turn" },
    { status: 'AWAITING_CHILD_CONFIRMATION', label: 'Your turn' },
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
        <CollectionHeading label={t('See all Rewards')} onSeeAll={onSeeAll}>
          {title}
        </CollectionHeading>
        {fromCache ? (
          <DesignText style={{ fontSize: 12, color: homeTokens.secondary }}>
            {t('Showing saved rewards. Updates may be pending.')}
          </DesignText>
        ) : null}
        {loading ? (
          <DesignText style={{ fontSize: 14, color: homeTokens.secondary }}>
            {t('Loading rewards…')}
          </DesignText>
        ) : null}
        {error ? (
          <>
            <FormMessage
              message={t('Your rewards could not be loaded. Try again.')}
            />
            {onRetry ? (
              <Button
                variant="outline"
                label={t('Try Rewards again')}
                onPress={onRetry}
              />
            ) : null}
          </>
        ) : null}
        {!loading && !error && rewards.length === 0 ? (
          <DesignText style={{ fontSize: 14, color: homeTokens.secondary }}>
            {fromCache ? t('No rewards saved yet.') : empty}
          </DesignText>
        ) : null}
        {visible.slice(0, 1).map((reward) =>
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
                  ? t('Earned · Waiting for Parent delivery')
                  : reward.status === 'AWAITING_CHILD_CONFIRMATION'
                    ? t('Delivered · Confirm when received')
                    : t('Received · Receipt confirmed')
              }
              reward={reward.terms}
              label={t('Open reward: {0}{1}', {
                '0': childNames[reward.childUid]
                  ? `${childNames[reward.childUid]} · `
                  : '',
                '1': reward.terms.title,
              })}
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
            <CollectionHeading label={t('See all Rewards')} onSeeAll={onSeeAll}>
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
          {t('Loading rewards…')}
        </DesignText>
      ) : null}
      {error ? (
        <>
          <FormMessage
            message={t('Your rewards could not be loaded. Try again.')}
          />
          {onRetry ? (
            <Button
              variant="outline"
              label={t('Try Rewards again')}
              onPress={onRetry}
            />
          ) : null}
        </>
      ) : null}
      {fromCache ? (
        <DesignText style={{ fontSize: 14, color: homeTokens.secondary }}>
          {t('Showing saved rewards. Updates may be pending.')}
        </DesignText>
      ) : null}
      {!loading && !error && rewards.length === 0 ? (
        <OfferOutcome
          title={
            fromCache ? t('No rewards are saved on this device yet.') : empty
          }
          centered={viewer === 'CHILD'}
          illustration={viewer === 'CHILD' ? 'no-rewards' : undefined}
        >
          {viewer === 'CHILD'
            ? t('Your earned rewards will appear here.')
            : undefined}
        </OfferOutcome>
      ) : null}
      {!loading &&
      !error &&
      rewards.length > 0 &&
      filteredRewards.length === 0 ? (
        <OfferOutcome
          title={t('No rewards in this status')}
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
  useAppLanguage();

  return (
    <HomeFeatureCard
      key={reward.id}
      title={reward.terms.title}
      reward={reward.terms}
      tone="mint"
      badge={
        reward.status === 'PENDING_FULFILLMENT'
          ? t('Earned')
          : reward.status === 'AWAITING_CHILD_CONFIRMATION'
            ? t('Delivered')
            : t('Received')
      }
      detail={
        reward.status === 'PENDING_FULFILLMENT'
          ? t('Waiting for Parent delivery')
          : reward.status === 'AWAITING_CHILD_CONFIRMATION'
            ? t('Confirm when received')
            : t('Receipt confirmed')
      }
    >
      <HomeCardAction
        label={t('Open reward')}
        accessibilityLabel={t('Open reward: {0}', {
          '0': reward.terms.title,
        })}
        tone="green"
        onPress={() => onSelect(reward.id)}
      />
    </HomeFeatureCard>
  );
}

function ChildRewardCollection({ children }: { children: ReactNode }) {
  return (
    <View style={{ gap: homeTokens.spacing.card, flexGrow: 1 }}>
      {children}
    </View>
  );
}
