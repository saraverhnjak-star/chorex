import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import {
  Button,
  FormMessage,
  Screen,
  TextField,
  useDynamicTypeStyles,
} from '@chorex/ui';
import { useChildSession } from '../src/auth/session';
import { getPairingErrorMessage } from '../src/pairing/messages';

function newIdempotencyKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export default function HomeScreen() {
  const session = useChildSession();
  const dynamicType = useDynamicTypeStyles();
  const [token, setToken] = useState('');
  const idempotencyKey = useRef<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  if (session.user) {
    return (
      <Screen>
        <View className="flex-1 justify-center py-12">
          <Text
            allowFontScaling={false}
            className="font-semibold uppercase tracking-widest text-text-muted"
            style={dynamicType.small}
          >
            Child app
          </Text>
          <Text
            allowFontScaling={false}
            accessibilityRole="header"
            className="mt-2 font-bold text-text"
            style={dynamicType.title}
          >
            Device paired
          </Text>
          <Text
            allowFontScaling={false}
            className="mt-3 text-text-muted"
            style={dynamicType.body}
          >
            This device is signed in and ready for ChoreX.
          </Text>
        </View>
      </Screen>
    );
  }

  const pairDevice = async () => {
    const currentKey = idempotencyKey.current ?? newIdempotencyKey();
    idempotencyKey.current = currentKey;
    setSubmitting(true);
    setError(undefined);
    try {
      await session.pair(token, currentKey);
    } catch (pairingError) {
      setError(getPairingErrorMessage(pairingError));
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <View className="flex-1 justify-center py-12">
        <Text
          allowFontScaling={false}
          className="font-semibold uppercase tracking-widest text-text-muted"
          style={dynamicType.small}
        >
          Child app
        </Text>
        <Text
          allowFontScaling={false}
          accessibilityRole="header"
          className="mt-2 font-bold text-text"
          style={dynamicType.title}
        >
          Pair this device
        </Text>
        <Text
          allowFontScaling={false}
          className="mt-3 text-text-muted"
          style={dynamicType.body}
        >
          Enter the one-time token shown in the Parent app.
        </Text>

        <View className="mt-8 gap-5 rounded-3xl border border-border bg-surface-warm p-5">
          <FormMessage message={error} />
          <TextField
            autoCapitalize="none"
            autoCorrect={false}
            editable={!submitting}
            label="Pairing token"
            onChangeText={(value) => {
              setToken(value);
              idempotencyKey.current = undefined;
              setError(undefined);
            }}
            onSubmitEditing={() => void pairDevice()}
            returnKeyType="done"
            value={token}
          />
          <Button
            disabled={!token.trim()}
            label="Pair device"
            loading={submitting}
            onPress={() => void pairDevice()}
          />
        </View>
      </View>
    </Screen>
  );
}
