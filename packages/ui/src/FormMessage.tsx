import { Text, View } from 'react-native';
import { useErrorAnnouncement } from './accessibility';
import { useDynamicTypeStyles } from './typography';

export function FormMessage({ message }: { message?: string }) {
  useErrorAnnouncement(message);
  const dynamicType = useDynamicTypeStyles();

  if (!message) return null;

  return (
    <View className="rounded-2xl bg-danger px-4 py-3">
      <Text
        allowFontScaling={false}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        className="font-medium text-surface"
        style={dynamicType.body}
      >
        {message}
      </Text>
    </View>
  );
}
