import { View } from 'react-native';
import { DesignText, homeTokens } from './Home';
export function TabCounter({
  count,
  color,
  textColor = homeTokens.surface,
}: {
  count: number;
  color: string;
  textColor?: string;
}) {
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
      <DesignText style={{ fontSize: 12, fontWeight: '700', color: textColor }}>
        {count > 99 ? '99+' : count}
      </DesignText>
    </View>
  );
}
