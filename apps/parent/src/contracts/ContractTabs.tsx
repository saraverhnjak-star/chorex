import { t, useAppLanguage, DesignText, homeTokens } from '@chorex/ui';
import {
  useActiveContracts,
  useReadyForReviewContracts,
} from '@chorex/firebase-client';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { ActiveContracts, ReadyForReviewContracts } from './ActiveContracts';

export function ContractTabs(props: {
  familyId: string;
  authUid: string;
  childNames: Readonly<Record<string, string>>;
}) {
  useAppLanguage();
  const [selected, setSelected] = useState<'active' | 'review'>('review');
  const active = useActiveContracts(props.familyId, props.authUid);
  const review = useReadyForReviewContracts(props.familyId, props.authUid);
  if (active.status === 'loading' || review.status === 'loading') return null;
  const List =
    selected === 'active' ? ActiveContracts : ReadyForReviewContracts;
  return (
    <View style={{ gap: homeTokens.spacing.section }}>
      <View
        accessibilityRole="tablist"
        style={{ flexDirection: 'row', gap: homeTokens.spacing.small }}
      >
        {(
          [
            { id: 'review', label: 'For review' },
            { id: 'active', label: 'Active' },
          ] as const
        ).map((tab) => (
          <Pressable
            key={tab.id}
            accessibilityRole="tab"
            accessibilityLabel={t(tab.label)}
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
              {t(tab.label)}
            </DesignText>
          </Pressable>
        ))}
      </View>
      <List {...props} showHeading={false} />
    </View>
  );
}
