import { Text, View } from 'react-native';

export function AppPlaceholder({ name }: { name: string }) {
  return (
    <View className="flex-1 items-center justify-center bg-white p-6">
      <Text
        accessibilityRole="header"
        className="text-xl font-semibold text-black"
      >
        {name}
      </Text>
    </View>
  );
}
