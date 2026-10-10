import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import {
  subscribeToCurrentChildOfferInbox,
  type ChildOfferInboxItem,
} from '@chorex/firebase-client';
import {
  Button,
  DesignText,
  FormMessage,
  OfferOutcome,
  ProposalTerms,
  homeTokens,
} from '@chorex/ui';
import { ParentHomeCard, ParentHomeRow } from '../navigation/ParentHomeRow';

export function SentOffers({
  familyId,
  childNames,
  offerId,
}: {
  familyId: string;
  childNames: Readonly<Record<string, string>>;
  offerId?: string;
}) {
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
  return (
    <View style={{ gap: homeTokens.spacing.medium, flexGrow: 1 }}>
      {state.status === 'loading' ? (
        <DesignText>Loading offers…</DesignText>
      ) : null}
      {state.status === 'error' ? (
        <>
          <FormMessage message="Your offers could not be loaded. Try again." />
          <Button
            label="Try offers again"
            onPress={() => {
              setState({ items: [], status: 'loading' });
              setAttempt((v) => v + 1);
            }}
          />
        </>
      ) : null}
      {state.status === 'ready' && state.items.length === 0 ? (
        <OfferOutcome
          centered
          illustration="no-offers"
          title={offerId ? 'Offer unavailable' : 'No sent offers'}
        >
          Offers waiting for your child&apos;s response will appear here.
        </OfferOutcome>
      ) : null}
      {state.items.map(({ offer, revision }) =>
        offerId ? (
          <ProposalTerms
            key={offer.id}
            layout="rewardFirst"
            revision={revision}
            status="Child's turn"
            author={`For ${childNames[offer.childUid] ?? 'Child'}`}
            support="Waiting for your child to accept, decline or suggest a change."
          />
        ) : (
          <ParentHomeCard key={offer.id}>
            <ParentHomeRow
              dense
              reward={revision.reward}
              title={revision.reward.title}
              detail={`${childNames[offer.childUid] ?? 'Child'} · Waiting for a response`}
              badge="Child's turn"
              action="View offer"
              label={`View offer: ${revision.reward.title}`}
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
