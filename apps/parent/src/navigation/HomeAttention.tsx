import { ParentHomeCard, ParentHomeRow } from './ParentHomeRow';
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import {
  subscribeToCurrentParentNegotiationInbox,
  useReadyForReviewContracts,
  usePendingRewards,
  type ParentNegotiationInboxItem,
} from '@chorex/firebase-client';
import {
  Button,
  CollectionHeading,
  DesignText,
  HomeListRow,
  HomeEmptyState,
  homeTokens,
} from '@chorex/ui';

type Props = {
  selectedChildUid?: string;
  familyId: string;
  authUid: string;
  childNames: Readonly<Record<string, string>>;
};
export function HomeAttention(props: Props) {
  const [attempt, setAttempt] = useState(0);
  return (
    <AttentionContent
      key={`${props.familyId}:${props.authUid}:${attempt}`}
      {...props}
      onRetry={() => setAttempt((v) => v + 1)}
    />
  );
}
function AttentionContent({
  familyId,
  authUid,
  childNames,
  selectedChildUid,
  onRetry,
}: Props & { onRetry: () => void }) {
  const router = useRouter();
  const [offers, setOffers] = useState<{
    status: 'loading' | 'ready' | 'error';
    items: readonly ParentNegotiationInboxItem[];
  }>({ status: 'loading', items: [] });
  const reviews = useReadyForReviewContracts(familyId, authUid);
  const rewards = usePendingRewards(familyId, authUid);
  useEffect(() => {
    let active = true;
    let stop: (() => void) | undefined;
    try {
      stop = subscribeToCurrentParentNegotiationInbox(
        familyId,
        (items) => {
          if (active) setOffers({ status: 'ready', items });
        },
        () => {
          if (active) setOffers({ status: 'error', items: [] });
        },
      );
    } catch {
      queueMicrotask(() => {
        if (active) setOffers({ status: 'error', items: [] });
      });
    }
    return () => {
      active = false;
      stop?.();
    };
  }, [familyId]);
  const items = [
    ...offers.items.map(({ offer, revision }) => ({
      id: `offer:${offer.id}`,
      childUid: offer.childUid,
      title: `${childNames[offer.childUid] ?? 'Child'} countered your offer`,
      detail: revision.reward.title,
      reward: revision.reward,
      icon: 'chatbox-outline' as const,
      onPress: () => router.navigate('/offers'),
    })),
    ...(reviews.status === 'ready' ? reviews.contracts : []).map((c) => ({
      id: `review:${c.id}`,
      childUid: c.childUid,
      title: `${childNames[c.childUid] ?? 'Child'} submitted for review`,
      detail: c.rewardTerms.title,
      reward: c.rewardTerms,
      icon: 'document-text-outline' as const,
      onPress: () =>
        router.push({
          pathname: '/contracts/[contractId]',
          params: { contractId: c.id },
        }),
    })),
    ...(rewards.status === 'ready' ? rewards.rewards : []).map((r) => ({
      id: `reward:${r.id}`,
      childUid: r.childUid,
      title: 'Reward waiting for delivery',
      detail: `${r.terms.title} · ${childNames[r.childUid] ?? 'Child'}`,
      icon: 'gift-outline' as const,
      reward: r.terms,
      onPress: () =>
        router.push({
          pathname: '/rewards/[rewardId]',
          params: { rewardId: r.id },
        }),
    })),
  ].filter((item) => !selectedChildUid || item.childUid === selectedChildUid);
  return (
    <View style={{ gap: homeTokens.spacing.section }}>
      <HomeAttentionList
        items={items.filter((item) => !item.id.startsWith('reward:'))}
        loading={offers.status === 'loading' || reviews.status === 'loading'}
        error={offers.status === 'error' || reviews.status === 'error'}
        cached={reviews.status === 'ready' && reviews.fromCache}
        onRetry={onRetry}
      />
      <HomeAttentionList
        heading="Rewards to fulfill"
        empty="No rewards waiting for delivery"
        items={items.filter((item) => item.id.startsWith('reward:'))}
        loading={rewards.status === 'loading'}
        error={rewards.status === 'error'}
        cached={rewards.status === 'ready' && rewards.fromCache}
        onRetry={onRetry}
      />
    </View>
  );
}

/** Read-only dashboard presentation; actions retain their source destinations. */
export function HomeAttentionList({
  items,
  loading = false,
  error = false,
  cached = false,
  onRetry,
  heading = 'Needs your attention',
  empty = 'Nothing needs your attention',
}: {
  heading?: string;
  empty?: string;
  items: readonly {
    id: string;
    title: string;
    detail: string;
    icon: React.ComponentProps<typeof HomeListRow>['icon'];
    reward?: React.ComponentProps<typeof HomeListRow>['reward'];
    onPress: () => void;
  }[];
  loading?: boolean;
  error?: boolean;
  cached?: boolean;
  onRetry: () => void;
}) {
  return (
    <View style={{ gap: homeTokens.spacing.medium }}>
      <CollectionHeading count={items.length}>{heading}</CollectionHeading>
      {cached ? (
        <DesignText style={{ fontSize: 12, color: homeTokens.secondary }}>
          Showing saved data. Updates may be pending.
        </DesignText>
      ) : null}
      {items.length ? (
        <ParentHomeCard>
          {items.slice(0, 3).map((item, index) => {
            const offer = item.id.startsWith('offer:');
            const reward = item.id.startsWith('reward:');
            return (
              <ParentHomeRow
                dense
                key={item.id}
                separator={index > 0}
                title={item.detail}
                detail={item.title}
                reward={item.reward ?? { type: 'CUSTOM', iconKey: 'gift' }}
                badge={
                  offer ? undefined : reward ? 'Waiting for you' : 'For review'
                }
                action={
                  offer
                    ? 'View proposal'
                    : reward
                      ? 'Fulfill reward'
                      : 'Review work'
                }
                label={`${item.title}: ${item.detail}`}
                button={reward}
                onPress={item.onPress}
              />
            );
          })}
        </ParentHomeCard>
      ) : (
        <HomeEmptyState
          icon={
            loading
              ? 'time-outline'
              : error
                ? 'alert-circle-outline'
                : 'checkmark-circle-outline'
          }
        >
          {loading
            ? 'Loading attention items…'
            : error
              ? 'Attention items could not be loaded.'
              : cached
                ? 'No attention items saved on this device.'
                : empty}
        </HomeEmptyState>
      )}
      {items.length > 3 ? (
        <DesignText style={{ fontSize: 12, color: homeTokens.secondary }}>
          More items in Offers, Contracts and Rewards.
        </DesignText>
      ) : null}
      {error ? (
        <>
          <DesignText
            accessibilityRole="alert"
            style={{ fontSize: 12, color: homeTokens.secondary }}
          >
            Some attention items could not be loaded.
          </DesignText>
          <Button
            label="Try attention again"
            variant="outline"
            onPress={onRetry}
          />
        </>
      ) : loading && items.length ? (
        <DesignText style={{ fontSize: 12, color: homeTokens.secondary }}>
          Loading more attention items…
        </DesignText>
      ) : null}
    </View>
  );
}
