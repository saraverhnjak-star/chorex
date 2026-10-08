import { Button } from './Button';
import { View } from 'react-native';
import type { EarnedReward, UserProfile } from '@chorex/domain';
import { FormMessage } from './FormMessage';
import { CountBadge, DesignText, homeTokens, CollectionHeading } from './Home';
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
  const groups =
    viewer === 'CHILD' && !preview
      ? [
          {
            label: 'Confirm receipt',
            rewards: visible.filter(
              (reward) => reward.status === 'AWAITING_CHILD_CONFIRMATION',
            ),
          },
          {
            label: 'Waiting for Parent',
            rewards: visible.filter(
              (reward) => reward.status === 'PENDING_FULFILLMENT',
            ),
          },
          {
            label: 'Received',
            rewards: visible.filter((reward) => reward.status === 'FULFILLED'),
          },
        ].filter((group) => group.rewards.length > 0)
      : [{ label: undefined, rewards: visible }];
  return (
    <SurfaceCard>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: homeTokens.spacing.small,
        }}
      >
        <CollectionHeading label="See all Rewards" onSeeAll={onSeeAll}>
          {title}
        </CollectionHeading>
        <CountBadge count={rewards.length} />
      </View>
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
            <Button label="Try Rewards again" onPress={onRetry} />
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
      {groups.map((group) => (
        <View
          key={group.label ?? 'rewards'}
          style={{ gap: homeTokens.spacing.medium }}
        >
          {group.label ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <DesignText
                accessibilityRole="header"
                style={{
                  fontSize: 16,
                  fontWeight: '600',
                  color: homeTokens.text,
                }}
              >
                {group.label}
              </DesignText>
              <CountBadge count={group.rewards.length} />
            </View>
          ) : null}
          {group.rewards.map((reward) => (
            <RewardCard
              key={reward.id}
              reward={reward}
              viewer={viewer}
              childName={childNames[reward.childUid]}
              onPress={() => onSelect(reward.id)}
            />
          ))}
        </View>
      ))}
    </SurfaceCard>
  );
}
