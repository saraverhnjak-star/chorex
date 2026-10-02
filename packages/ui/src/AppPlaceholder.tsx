import { ScrollView, Text, View } from 'react-native';

export function AppPlaceholder({ name }: { name: string }) {
  return (
    <View className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-6 py-10">
          <View className="mx-auto w-full max-w-md">
            <Text className="text-sm font-semibold uppercase tracking-widest text-text-muted">
              Shared visual foundation
            </Text>
            <Text
              accessibilityRole="header"
              className="mt-2 text-3xl font-bold leading-tight text-text"
            >
              {name}
            </Text>
            <Text className="mt-3 text-base leading-6 text-text-muted">
              A warm, clear foundation for family agreements.
            </Text>

            <View className="mt-8 rounded-3xl border border-border bg-surface-warm p-5">
              <View className="flex-row items-center">
                <View
                  accessible={false}
                  className="mr-2 h-2.5 w-2.5 rounded-full bg-success"
                />
                <Text className="flex-1 text-sm font-semibold text-text">
                  Foundation ready
                </Text>
              </View>

              <Text className="mt-4 text-xl font-bold text-text">
                Amber Aurora
              </Text>
              <Text className="mt-2 text-base leading-6 text-text-muted">
                Shared colors for calm, readable Parent and Child experiences.
              </Text>

              <View className="mt-6 rounded-2xl bg-primary px-5 py-4">
                <Text className="text-center text-base font-semibold text-text">
                  Primary action style
                </Text>
              </View>
              <View className="mt-3 rounded-2xl border border-focus bg-secondary px-5 py-4">
                <Text className="text-center text-base font-semibold text-text">
                  Secondary action style
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
