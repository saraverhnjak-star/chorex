import { amberAuroraPalette } from '@chorex/ui';
import {
  t,
  useAppLanguage,
  Button,
  CollectionHeading,
  DesignText,
  HomeListRow,
  HomeEmptyState,
  homeTokens,
} from '@chorex/ui';
import { ParentHomeCard, ParentHomeRow } from './ParentHomeRow';
import { useEffect, useLayoutEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import {
  subscribeToCurrentParentNegotiationInbox,
  subscribeToCurrentChildOfferInbox,
  type ChildOfferInboxItem,
  useReadyForReviewContracts,
  useActiveContracts,
  usePendingRewards,
  type ParentNegotiationInboxItem,
} from '@chorex/firebase-client';

type Props = {
  onLoadingChange?: (loading: boolean) => void;
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
  onLoadingChange,
}: Props & { onRetry: () => void }) {
  useAppLanguage();

  const router = useRouter();
  const [offers, setOffers] = useState<{
    status: 'loading' | 'ready' | 'error';
    items: readonly ParentNegotiationInboxItem[];
  }>({ status: 'loading', items: [] });
  const [sentOffers, setSentOffers] = useState<{
    status: 'loading' | 'ready' | 'error';
    items: readonly ChildOfferInboxItem[];
  }>({ status: 'loading', items: [] });
  useEffect(() => {
    let active = true;
    let stop: (() => void) | undefined;
    try {
      stop = subscribeToCurrentChildOfferInbox(
        familyId,
        (items) => {
          if (active) setSentOffers({ status: 'ready', items });
        },
        () => {
          if (active) setSentOffers({ status: 'error', items: [] });
        },
      );
    } catch {
      queueMicrotask(() => {
        if (active) setSentOffers({ status: 'error', items: [] });
      });
    }
    return () => {
      active = false;
      stop?.();
    };
  }, [familyId]);
  const activeContracts = useActiveContracts(familyId, authUid);
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
      childName: childNames[offer.childUid] ?? t('Child'),
      title: t('{0} countered your offer', {
        '0': childNames[offer.childUid] ?? t('Child'),
      }),
      detail: revision.reward.title,
      reward: revision.reward,
      icon: 'chatbox-outline' as const,
      onPress: () =>
        router.push({
          pathname: '/offers/[offerId]',
          params: { offerId: offer.id },
        }),
    })),
    ...sentOffers.items.map(({ offer, revision }) => ({
      id: `sent:${offer.id}`,
      childUid: offer.childUid,
      childName: childNames[offer.childUid] ?? t('Child'),
      title: revision.reward.title,
      detail: t('{0} · Waiting for a response', {
        '0': childNames[offer.childUid] ?? t('Child'),
      }),
      reward: revision.reward,
      icon: 'chatbox-outline' as const,
      onPress: () =>
        router.push({
          pathname: '/offers/[offerId]',
          params: { offerId: offer.id, sent: 'true' },
        }),
    })),
    ...(reviews.status === 'ready' ? reviews.contracts : []).map((c) => ({
      id: `review:${c.id}`,
      childUid: c.childUid,
      childName: childNames[c.childUid] ?? t('Child'),
      title: t('{0} submitted for review', {
        '0': childNames[c.childUid] ?? t('Child'),
      }),
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
      childName: childNames[r.childUid] ?? t('Child'),
      title: t('Reward waiting for delivery'),
      cardTitle: r.terms.title,
      detail: `${r.terms.title} · ${childNames[r.childUid] ?? t('Child')}`,
      icon: 'gift-outline' as const,
      reward: r.terms,
      onPress: () =>
        router.push({
          pathname: '/rewards/[rewardId]',
          params: { rewardId: r.id },
        }),
    })),
  ].filter((item) => !selectedChildUid || item.childUid === selectedChildUid);
  const loading =
    offers.status === 'loading' ||
    sentOffers.status === 'loading' ||
    reviews.status === 'loading' ||
    rewards.status === 'loading' ||
    activeContracts.status === 'loading';
  useLayoutEffect(() => {
    onLoadingChange?.(loading);
  }, [loading, onLoadingChange]);
  if (loading) return null;
  const emptyHome =
    offers.status === 'ready' &&
    sentOffers.status === 'ready' &&
    reviews.status === 'ready' &&
    rewards.status === 'ready' &&
    activeContracts.status === 'ready' &&
    items.length === 0 &&
    !activeContracts.contracts.some(
      (contract) => !selectedChildUid || contract.childUid === selectedChildUid,
    );
  if (emptyHome)
    return (
      <View
        style={{
          flexGrow: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: homeTokens.spacing.medium,
        }}
      >
        <DesignText
          accessibilityRole="header"
          style={{
            fontSize: 20,
            fontWeight: '700',
            color: homeTokens.text,
            textAlign: 'center',
          }}
        >
          {t('Create your first offer')}
        </DesignText>
        <DesignText
          style={{
            fontSize: 16,
            color: homeTokens.secondary,
            textAlign: 'center',
          }}
        >
          {t(
            'Start an agreement with your child by choosing tasks and a reward.',
          )}
        </DesignText>
        <Button
          label={t('Create offer')}
          variant="blue"
          lightText
          onPress={() => router.push('/offers/create')}
        />
      </View>
    );
  return (
    <View style={{ gap: homeTokens.spacing.section }}>
      <HomeAttentionList
        items={items.filter(
          (item) =>
            !item.id.startsWith('reward:') && !item.id.startsWith('sent:'),
        )}
        loading={false}
        error={offers.status === 'error' || reviews.status === 'error'}
        cached={reviews.status === 'ready' && reviews.fromCache}
        onRetry={onRetry}
      />
      <HomeAttentionList
        hideWhenEmpty
        countTone="green"
        heading={t('Rewards to fulfill')}
        empty={t('No rewards waiting for delivery')}
        items={items.filter((item) => item.id.startsWith('reward:'))}
        loading={false}
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
  hideWhenEmpty = false,
  countTone = 'coral',
  heading = t('Needs your attention'),
  empty = t('Nothing needs your attention'),
}: {
  hideWhenEmpty?: boolean;
  countTone?: 'coral' | 'green';
  heading?: string;
  empty?: string;
  items: readonly {
    id: string;
    title: string;
    cardTitle?: string;
    detail: string;
    childName?: string;
    icon: React.ComponentProps<typeof HomeListRow>['icon'];
    reward?: React.ComponentProps<typeof HomeListRow>['reward'];
    onPress: () => void;
  }[];
  loading?: boolean;
  error?: boolean;
  cached?: boolean;
  onRetry: () => void;
}) {
  useAppLanguage();

  if (hideWhenEmpty && !loading && !error && items.length === 0) return null;
  return (
    <View style={{ gap: homeTokens.spacing.medium }}>
      <CollectionHeading
        seeAllColor={amberAuroraPalette.navigationActive}
        count={items.length}
        countTone={countTone}
      >
        {heading}
      </CollectionHeading>
      {cached ? (
        <DesignText style={{ fontSize: 12, color: homeTokens.secondary }}>
          {t('Showing saved data. Updates may be pending.')}
        </DesignText>
      ) : null}
      {items.length ? (
        <View style={{ gap: homeTokens.spacing.medium }}>
          {items.slice(0, 3).map((item) => {
            const sent = item.id.startsWith('sent:');
            const offer = item.id.startsWith('offer:') || sent;
            const reward = item.id.startsWith('reward:');
            return (
              <ParentHomeCard
                key={item.id}
                tone={reward ? 'mint' : offer ? 'coralSurface' : 'blue'}
              >
                <ParentHomeRow
                  dense
                  tone={reward ? 'mint' : offer ? 'coralSurface' : 'blue'}
                  title={item.cardTitle ?? (sent ? item.title : item.detail)}
                  detail={item.childName ?? (sent ? item.detail : item.title)}
                  reward={item.reward ?? { type: 'CUSTOM', iconKey: 'gift' }}
                  badge={
                    offer
                      ? sent
                        ? t('Kids turn')
                        : t('Counteroffer')
                      : reward
                        ? t('Your turn')
                        : t('For review')
                  }
                  action={
                    offer
                      ? t('View proposal')
                      : reward
                        ? t('Fulfill reward')
                        : t('Review work')
                  }
                  label={`${item.title}: ${item.detail}`}
                  button={reward}
                  onPress={item.onPress}
                />
              </ParentHomeCard>
            );
          })}
        </View>
      ) : (
        <HomeEmptyState
          showIcon={false}
          icon={
            loading
              ? 'time-outline'
              : error
                ? 'alert-circle-outline'
                : 'checkmark-circle-outline'
          }
        >
          {loading
            ? t('Loading attention items…')
            : error
              ? t('Attention items could not be loaded.')
              : cached
                ? t('No attention items saved on this device.')
                : empty}
        </HomeEmptyState>
      )}
      {items.length > 3 ? (
        <DesignText style={{ fontSize: 12, color: homeTokens.secondary }}>
          {t('More items in Offers, Contracts and Rewards.')}
        </DesignText>
      ) : null}
      {error ? (
        <>
          <DesignText
            accessibilityRole="alert"
            style={{ fontSize: 12, color: homeTokens.secondary }}
          >
            {t('Some attention items could not be loaded.')}
          </DesignText>
          <Button
            label={t('Try attention again')}
            variant="outline"
            onPress={onRetry}
          />
        </>
      ) : loading && items.length ? (
        <DesignText style={{ fontSize: 12, color: homeTokens.secondary }}>
          {t('Loading more attention items…')}
        </DesignText>
      ) : null}
    </View>
  );
}
