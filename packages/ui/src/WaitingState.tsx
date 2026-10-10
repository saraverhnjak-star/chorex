import type { ReactNode } from 'react';
import { Image, View } from 'react-native';
import { DesignText, homeTokens } from './Home';

export function WaitingState({ children }: { children: ReactNode }) {
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        flexGrow: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: homeTokens.spacing.medium,
        paddingVertical: homeTokens.spacing.section,
      }}
    >
      <Image
        accessible={false}
        source={require('../assets/icons/waiting.png')}
        resizeMode="contain"
        style={{ width: 180, height: 180 }}
      />
      <DesignText
        style={{
          fontSize: 16,
          color: homeTokens.secondary,
          textAlign: 'center',
        }}
      >
        {children}
      </DesignText>
    </View>
  );
}
