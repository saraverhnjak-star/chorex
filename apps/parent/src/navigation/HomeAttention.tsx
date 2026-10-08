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
      title: `${childNames[offer.childUid] ?? 'Child'} countered your offer`,
      detail: revision.reward.title,
      icon: 'chatbox-outline' as const,
      onPress: () => router.navigate('/offers'),
    })),
    ...(reviews.status === 'ready' ? reviews.contracts : []).map((c) => ({
      id: `review:${c.id}`,
      title: `${childNames[c.childUid] ?? 'Child'} submitted for review`,
      detail: c.rewardTerms.title,
      icon: 'document-text-outline' as const,
      onPress: () =>
        router.push({
          pathname: '/contracts/[contractId]',
          params: { contractId: c.id },
        }),
    })),
    ...(rewards.status === 'ready' ? rewards.rewards : []).map((r) => ({
      id: `reward:${r.id}`,
      title: 'Reward waiting for delivery',
      detail: `${r.terms.title} · ${childNames[r.childUid] ?? 'Child'}`,
      icon: 'gift-outline' as const,
      onPress: () =>
        router.push({
          pathname: '/rewards/[rewardId]',
          params: { rewardId: r.id },
        }),
    })),
  ];
  const loading = [offers, reviews, rewards].some(
    (s) => s.status === 'loading',
  );
  const error = [offers, reviews, rewards].some((s) => s.status === 'error');
  const cached =
    (reviews.status === 'ready' && reviews.fromCache) ||
    (rewards.status === 'ready' && rewards.fromCache);
  return (
    <HomeAttentionList
      items={items}
      loading={loading}
      error={error}
      cached={cached}
      onRetry={onRetry}
    />
  );
}

/** Read-only dashboard presentation; actions retain their source destinations. */
export function HomeAttentionList({
  items,
  loading = false,
  error = false,
  cached = false,
  onRetry,
}: {
  items: readonly {
    id: string;
    title: string;
    detail: string;
    icon: React.ComponentProps<typeof HomeListRow>['icon'];
    onPress: () => void;
  }[];
  loading?: boolean;
  error?: boolean;
  cached?: boolean;
  onRetry: () => void;
}) {
  return (
    <View style={{ gap: homeTokens.spacing.medium }}>
      <CollectionHeading count={items.length}>
        Needs your attention
      </CollectionHeading>
      {cached ? (
        <DesignText style={{ fontSize: 12, color: homeTokens.secondary }}>
          Showing saved data. Updates may be pending.
        </DesignText>
      ) : null}
      {items.length ? (
        <View
          style={{
            overflow: 'hidden',
            borderRadius: homeTokens.radius.card,
            borderWidth: 1,
            borderColor: homeTokens.border,
            backgroundColor: homeTokens.surface,
          }}
        >
          {items.slice(0, 3).map((item, index) => (
            <HomeListRow
              key={item.id}
              title={item.title}
              detail={item.detail}
              icon={item.icon}
              label={`${item.title}: ${item.detail}`}
              onPress={item.onPress}
              grouped
              separator={index > 0}
            />
          ))}
        </View>
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
                : 'Nothing needs your attention'}
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
