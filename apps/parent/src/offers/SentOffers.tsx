import { ParentEmptyState } from '../navigation/ParentEmptyState';
import {
  t,
  useAppLanguage,
  Button,
  FormMessage,
  ProposalTerms,
  homeTokens,
} from '@chorex/ui';
import { useEffect, useLayoutEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import {
  subscribeToCurrentChildOfferInbox,
  type ChildOfferInboxItem,
} from '@chorex/firebase-client';
import { ParentHomeCard, ParentHomeRow } from '../navigation/ParentHomeRow';

export function SentOffers({
  familyId,
  childNames,
  offerId,
  onLoadingChange,
}: {
  familyId: string;
  childNames: Readonly<Record<string, string>>;
  offerId?: string;
  onLoadingChange?: (loading: boolean) => void;
}) {
  useAppLanguage();

  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    items: readonly ChildOfferInboxItem[];
    status: 'loading' | 'ready' | 'error';
  }>({ items: [], status: 'loading' });
  useEffect(() => {
    let active = true;
    let stop: (() => void) | undefined;
    try {
      stop = subscribeToCurrentChildOfferInbox(
        familyId,
        (items) => {
          if (active) setState({ items, status: 'ready' });
        },
        () => {
          if (active) setState({ items: [], status: 'error' });
        },
        offerId,
      );
    } catch {
      queueMicrotask(() => {
        if (active) setState({ items: [], status: 'error' });
      });
    }
    return () => {
      active = false;
      stop?.();
    };
  }, [familyId, offerId, attempt]);
  useLayoutEffect(() => {
    onLoadingChange?.(state.status === 'loading');
  }, [state.status, onLoadingChange]);
  if (state.status === 'loading') return null;
  return (
    <View style={{ gap: homeTokens.spacing.medium, flexGrow: 1 }}>
      {state.status === 'error' ? (
        <>
          <FormMessage
            message={t('Your offers could not be loaded. Try again.')}
          />
          <Button
            label={t('Try offers again')}
            onPress={() => {
              setState({ items: [], status: 'loading' });
              setAttempt((v) => v + 1);
            }}
          />
        </>
      ) : null}
      {state.status === 'ready' && state.items.length === 0 ? (
        <ParentEmptyState
          title={offerId ? t('Offer unavailable') : t('No sent offers')}
        >
          {t("Offers waiting for your child's response will appear here.")}
        </ParentEmptyState>
      ) : null}
      {state.items.map(({ offer, revision }) =>
        offerId ? (
          <ProposalTerms
            cardHeader
            participantName={childNames[offer.childUid] ?? t('Child')}
            key={offer.id}
            layout="rewardFirst"
            revision={revision}
            status={t('Kids turn')}
          />
        ) : (
          <ParentHomeCard tone="coralSurface" key={offer.id}>
            <ParentHomeRow
              dense
              reward={revision.reward}
              title={revision.reward.title}
              detail={t('{0} · Waiting for a response', {
                '0': childNames[offer.childUid] ?? t('Child'),
              })}
              badge={t('Kids turn')}
              action={t('View offer')}
              label={t('View offer: {0}', { '0': revision.reward.title })}
              onPress={() =>
                router.push({
                  pathname: '/offers/[offerId]',
                  params: { offerId: offer.id, sent: 'true' },
                })
              }
            />
          </ParentHomeCard>
        ),
      )}
    </View>
  );
}
