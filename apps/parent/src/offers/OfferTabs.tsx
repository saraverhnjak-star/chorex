import { useAppLanguage, StatusTabs, homeTokens } from '@chorex/ui';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { ParentNegotiationInbox } from './ParentNegotiationInbox';
import { SentOffers } from './SentOffers';
import {
  subscribeToCurrentParentNegotiationInbox,
  subscribeToCurrentChildOfferInbox,
} from '@chorex/firebase-client';
import type { ChildFamilyMembership } from '@chorex/domain';

export function OfferTabs(props: {
  familyId: string;
  authUid: string;
  childNames: Readonly<Record<string, string>>;
  activeChildren: readonly ChildFamilyMembership[];
}) {
  useAppLanguage();
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<'sent' | 'counter'>('counter');
  const identity = `${props.authUid}:${props.familyId}`;
  const [countState, setCountState] = useState({
    identity,
    counts: { Counteroffers: 0, Sent: 0 },
  });
  const counts = countState.identity === identity ? countState.counts : {};
  useEffect(() => {
    let active = true;
    const stops: (() => void)[] = [];
    for (const [key, subscribe] of [
      ['Counteroffers', subscribeToCurrentParentNegotiationInbox],
      ['Sent', subscribeToCurrentChildOfferInbox],
    ] as const) {
      try {
        stops.push(
          subscribe(
            props.familyId,
            (items) => {
              if (active)
                setCountState((current) => ({
                  identity,
                  counts: {
                    ...(current.identity === identity
                      ? current.counts
                      : { Counteroffers: 0, Sent: 0 }),
                    [key]: items.length,
                  },
                }));
            },
            () => {
              if (active)
                setCountState((current) => ({
                  identity,
                  counts: {
                    ...(current.identity === identity
                      ? current.counts
                      : { Counteroffers: 0, Sent: 0 }),
                    [key]: 0,
                  },
                }));
            },
          ),
        );
      } catch {
        // The selected list exposes its localized load failure and retry action.
      }
    }
    return () => {
      active = false;
      stops.forEach((stop) => stop());
    };
  }, [props.familyId, identity]);
  return (
    <View
      style={{ gap: homeTokens.spacing.section, opacity: loading ? 0 : 1 }}
      pointerEvents={loading ? 'none' : 'auto'}
      accessibilityElementsHidden={loading}
      importantForAccessibility={loading ? 'no-hide-descendants' : 'auto'}
    >
      <StatusTabs
        tone="neutral"
        labels={['Counteroffers', 'Sent']}
        counts={counts}
        selected={selected === 'counter' ? 'Counteroffers' : 'Sent'}
        onSelect={(label) => {
          const next = label === 'Counteroffers' ? 'counter' : 'sent';
          if (selected !== next) {
            setLoading(true);
            setSelected(next);
          }
        }}
      />
      {selected === 'counter' ? (
        <ParentNegotiationInbox
          onLoadingChange={setLoading}
          {...props}
          list
          showHeading={false}
        />
      ) : (
        <SentOffers
          onLoadingChange={setLoading}
          key={`${props.authUid}:${props.familyId}`}
          {...props}
        />
      )}
    </View>
  );
}
