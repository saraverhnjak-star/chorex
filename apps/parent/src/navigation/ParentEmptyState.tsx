import type { ReactNode } from 'react';
import { View } from 'react-native';
import { DesignText, homeTokens } from '@chorex/ui';

export function ParentEmptyState({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <View
      style={{
        padding: homeTokens.spacing.card,
        gap: homeTokens.spacing.small,
        borderRadius: homeTokens.radius.card,
        backgroundColor: homeTokens.surface,
      }}
    >
      <DesignText
        accessibilityRole="header"
        style={{ fontSize: 18, fontWeight: '700', color: homeTokens.text }}
      >
        {title}
      </DesignText>
      {children ? (
        <DesignText
          style={{ fontSize: 14, lineHeight: 21, color: homeTokens.secondary }}
        >
          {children}
        </DesignText>
      ) : null}
    </View>
  );
}
