import type { ReactNode } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';
import { DesignText, homeTokens } from './Home';

export function SetupSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <View
      style={{
        gap: homeTokens.spacing.card,
        padding: homeTokens.spacing.card,
        borderRadius: homeTokens.radius.card,
        borderWidth: 1,
        borderColor: homeTokens.border,
        backgroundColor: homeTokens.surface,
      }}
    >
      <View
        style={{
          alignSelf: 'flex-start',
          padding: homeTokens.spacing.small,
          borderRadius: homeTokens.radius.card,
          backgroundColor: homeTokens.mint,
        }}
      >
        <Ionicons
          accessible={false}
          name="people-outline"
          size={24}
          color={homeTokens.text}
        />
      </View>
      <DesignText
        accessibilityRole="header"
        style={{ fontSize: 24, fontWeight: '700', color: homeTokens.text }}
      >
        {title}
      </DesignText>
      <DesignText style={{ fontSize: 16, color: homeTokens.secondary }}>
        {description}
      </DesignText>
      {children}
    </View>
  );
}
