import type { ReactNode } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DesignThemeProvider, homeTokens } from './Home';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

export function Screen({
  children,
  design = false,
  entry = false,
}: {
  children: ReactNode;
  design?: boolean;
  entry?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const content = (
    <View
      className="flex-1 bg-background"
      style={
        design
          ? {
              backgroundColor: homeTokens.app,
              paddingTop: entry ? insets.top : undefined,
              paddingBottom: entry ? insets.bottom : undefined,
            }
          : undefined
      }
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ flexGrow: 1 }}
          contentInsetAdjustmentBehavior={entry ? 'never' : 'automatic'}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View
            className={`mx-auto w-full max-w-md flex-1 px-6 ${entry ? 'py-4' : 'py-10'}`}
          >
            {children}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
  return design ? (
    <DesignThemeProvider>{content}</DesignThemeProvider>
  ) : (
    content
  );
}
