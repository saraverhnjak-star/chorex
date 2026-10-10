import type { ReactNode } from 'react';
import { View } from 'react-native';
import { SectionHeading, homeTokens } from '@chorex/ui';

export function ParentSettingsSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={{ gap: homeTokens.spacing.medium }}>
      <SectionHeading>{title}</SectionHeading>
      <View
        style={{
          backgroundColor: homeTokens.surface,
          borderRadius: homeTokens.radius.card,
          overflow: 'hidden',
        }}
      >
        {children}
      </View>
    </View>
  );
}
