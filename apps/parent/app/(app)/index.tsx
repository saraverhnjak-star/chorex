import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, FormMessage, Screen, useDynamicTypeStyles } from '@chorex/ui';
import { getAuthErrorMessage } from '../../src/auth/messages';
import { useParentSession } from '../../src/auth/session';

export default function AuthenticatedHomeScreen() {
  const { user, signOut } = useParentSession();
  const dynamicType = useDynamicTypeStyles();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  const handleSignOut = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(undefined);
    try {
      await signOut();
    } catch (signOutError) {
      setError(getAuthErrorMessage(signOutError));
      setSubmitting(false);
    }
  };

  if (!user) return null;

  return (
    <Screen>
      <View className="py-6">
        <Text
          allowFontScaling={false}
          className="font-semibold uppercase tracking-widest text-text-muted"
          style={dynamicType.small}
        >
          Parent app
        </Text>
        <Text
          allowFontScaling={false}
          accessibilityRole="header"
          className="mt-2 font-bold text-text"
          style={dynamicType.title}
        >
          ChoreX Parent
        </Text>

        <View className="mt-8 rounded-3xl border border-border bg-surface-warm p-5">
          <View className="flex-row items-center">
            <View
              accessible={false}
              className="mr-2 h-2.5 w-2.5 rounded-full bg-success"
            />
            <Text
              allowFontScaling={false}
              className="flex-1 font-semibold text-text"
              style={dynamicType.body}
            >
              Signed in
            </Text>
          </View>
          <Text
            allowFontScaling={false}
            className="mt-4 font-semibold uppercase tracking-wider text-text-muted"
            style={dynamicType.small}
          >
            Development account
          </Text>
          <Text
            allowFontScaling={false}
            className="mt-2 text-text"
            style={dynamicType.body}
          >
            {user.email ?? 'Email unavailable'}
          </Text>
          <Text
            allowFontScaling={false}
            className="mt-5 text-text-muted"
            style={dynamicType.body}
          >
            Family setup is the next product step. No family or child data
            exists yet.
          </Text>
        </View>

        <View className="mt-6 gap-4">
          <FormMessage message={error} />
          <Button
            label="Sign out"
            loading={submitting}
            onPress={handleSignOut}
            variant="secondary"
          />
        </View>
      </View>
    </Screen>
  );
}
