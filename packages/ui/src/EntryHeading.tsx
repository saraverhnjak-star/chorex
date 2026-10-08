import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';
import { DesignText, homeTokens } from './Home';

/** Presentation only: no session, navigation or onboarding state. */
export function EntryHeading({
  title,
  description,
  child = false,
}: {
  title: string;
  description: string;
  child?: boolean;
}) {
  return (
    <View style={{ gap: 12 }}>
      <DesignText
        accessibilityRole="header"
        style={{ fontSize: 30, fontWeight: '800', color: homeTokens.text }}
      >
        Chore
        <DesignText style={{ fontSize: 30, color: homeTokens.coral }}>
          X
        </DesignText>
      </DesignText>
      <View
        style={{
          alignSelf: 'flex-start',
          borderRadius: 16,
          padding: 12,
          backgroundColor: child ? homeTokens.mint : homeTokens.coralSurface,
        }}
      >
        <Ionicons
          accessible={false}
          name={child ? 'link-outline' : 'people-outline'}
          size={28}
          color={homeTokens.text}
        />
      </View>
      <DesignText
        accessibilityRole="header"
        style={{ fontSize: 28, fontWeight: '700', color: homeTokens.text }}
      >
        {title}
      </DesignText>
      <DesignText style={{ fontSize: 16, color: homeTokens.secondary }}>
        {description}
      </DesignText>
    </View>
  );
}
