import { View } from 'react-native';
import { DesignText, homeTokens } from './Home';
export function TabCounter({ count, color }: { count: number; color: string }) {
  if (count <= 0) return null;
  return (
    <View
      style={{
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <DesignText
        style={{ fontSize: 12, fontWeight: '700', color: homeTokens.surface }}
      >
        {count > 99 ? '99+' : count}
      </DesignText>
    </View>
  );
}
