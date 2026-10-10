import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { DesignText, homeTokens } from '@chorex/ui';
import { ParentNegotiationInbox } from './ParentNegotiationInbox';
import { SentOffers } from './SentOffers';
import type { ChildFamilyMembership } from '@chorex/domain';

export function OfferTabs(props: {
  familyId: string;
  authUid: string;
  childNames: Readonly<Record<string, string>>;
  activeChildren: readonly ChildFamilyMembership[];
}) {
  const [selected, setSelected] = useState<'sent' | 'counter'>('counter');
  return (
    <View style={{ gap: homeTokens.spacing.section }}>
      <View
        accessibilityRole="tablist"
        style={{ flexDirection: 'row', gap: homeTokens.spacing.small }}
      >
        {(
          [
            { id: 'counter', label: 'Counteroffers' },
            { id: 'sent', label: 'Sent' },
          ] as const
        ).map((tab) => (
          <Pressable
            key={tab.id}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: selected === tab.id }}
            onPress={() => setSelected(tab.id)}
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 44,
              paddingHorizontal: homeTokens.spacing.small,
              borderRadius: homeTokens.radius.pill,
              borderWidth: 1,
              borderColor:
                selected === tab.id ? homeTokens.text : homeTokens.border,
              backgroundColor:
                selected === tab.id ? homeTokens.text : homeTokens.surface,
              justifyContent: 'center',
            }}
          >
            <DesignText
              numberOfLines={1}
              style={{
                textAlign: 'center',
                fontSize: 16,
                fontWeight: '600',
                color:
                  selected === tab.id
                    ? homeTokens.surface
                    : homeTokens.secondary,
              }}
            >
              {tab.label}
            </DesignText>
          </Pressable>
        ))}
      </View>
      {selected === 'counter' ? (
        <ParentNegotiationInbox {...props} list showHeading={false} />
      ) : (
        <SentOffers key={`${props.authUid}:${props.familyId}`} {...props} />
      )}
    </View>
  );
}
