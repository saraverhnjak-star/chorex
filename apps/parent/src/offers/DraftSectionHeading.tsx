import { DesignText, homeTokens } from '@chorex/ui';
import type { ReactNode } from 'react';
import { View } from 'react-native';

export function DraftSectionHeading({
  children,
  tone,
}: {
  children: ReactNode;
  tone: 'blue' | 'mint' | 'coralSurface' | 'lavender';
}) {
  return (
    <View
      style={{
        borderTopWidth: tone === 'blue' ? 0 : 1,
        borderColor: homeTokens.border,
        paddingTop: tone === 'blue' ? 0 : homeTokens.spacing.medium,
      }}
    >
      <DesignText
        accessibilityRole="header"
        style={{ fontSize: 16, fontWeight: '700', color: homeTokens.text }}
      >
        {children}
      </DesignText>
    </View>
  );
}
