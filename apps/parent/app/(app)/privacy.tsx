import {
  t,
  useAppLanguage,
  Button,
  DesignText,
  amberAuroraPalette,
  EntryHeading,
  FormMessage,
  Screen,
  useDynamicTypeStyles,
} from '@chorex/ui';
import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { requestParentAccountDeletion } from '@chorex/firebase-client';
import { PasswordField } from '../../src/auth/PasswordField';

function deletionMessage(error: unknown): string {
  const value = error as { code?: string; details?: { code?: string } };
  const code = value?.details?.code ?? value?.code;
  if (code === 'INVALID_CREDENTIALS')
    return t('Check your password and try again.');
  if (code === 'RECENT_AUTH_REQUIRED')
    return t('Please verify your password again.');
  if (code === 'ACCOUNT_DELETION_SCOPE_UNSUPPORTED')
    return t(
      'This account has shared or incomplete family relationships. Deletion needs a support review before it can proceed.',
    );
  if (code === 'ACCOUNT_DELETION_IN_PROGRESS')
    return t('Your deletion request is already being processed.');
  return t(
    'We could not confirm your deletion request. Check your connection and try again.',
  );
}
export default function PrivacyScreen() {
  useAppLanguage();

  const router = useRouter();
  const type = useDynamicTypeStyles();
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const key = useRef(Crypto.randomUUID());
  const remove = async () => {
    if (busy || !password) return;
    setBusy(true);
    setMessage(undefined);
    const credential = password;
    setPassword('');
    try {
      await requestParentAccountDeletion(credential, {
        idempotencyKey: key.current,
        confirmation: 'DELETE_ACCOUNT_AND_FAMILY',
      });
      setMessage(
        t(
          'Deletion accepted. Cleanup continues securely even after you close the app.',
        ),
      );
    } catch (error) {
      setMessage(deletionMessage(error));
      setBusy(false);
    }
  };
  return (
    <Screen design>
      <View className="gap-5">
        <EntryHeading
          title={t('Privacy & Data')}
          description={t('Understand your family’s data and account choices.')}
        />
        <Text
          allowFontScaling={false}
          style={type.body}
          className="text-home-text"
        >
          {t(
            'ChoreX uses your email for sign-in, family display names, and the terms, progress and review feedback of your agreements. Your family data is private to authorized participants.',
          )}
        </Text>
        <Text
          allowFontScaling={false}
          style={type.body}
          className="text-home-text"
        >
          {t(
            'Production builds use Firebase Crashlytics for crash diagnostics. We add no account IDs or agreement content to custom reports. SDK device/session identifiers and uploaded reports follow the provider’s separate retention policy; deleting your account cannot selectively remove those reports. ChoreX has no product analytics.',
          )}
        </Text>
        <Text
          allowFontScaling={false}
          style={type.body}
          className="text-home-text"
        >
          {t(
            'Notifications use Expo Push Service and your device’s notification provider. You control OS permission and optional reminders in Settings. Turning off notifications does not delete agreements.',
          )}
        </Text>
        <Text
          allowFontScaling={false}
          style={type.body}
          className="text-home-muted"
        >
          {t(
            'The public privacy policy and external deletion-request route are pending release review.',
          )}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Back to Settings')}
          accessibilityState={{ disabled: busy }}
          onPress={() => router.replace('/more')}
          disabled={busy}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <DesignText
            style={{ fontSize: 14, color: amberAuroraPalette.navigationActive }}
          >
            ← {t('Back')}
          </DesignText>
        </Pressable>
        <Text
          accessibilityRole="header"
          allowFontScaling={false}
          style={type.title}
          className="font-bold text-home-text"
        >
          {t('Delete account')}
        </Text>
        <Text
          allowFontScaling={false}
          style={type.body}
          className="text-home-text"
        >
          {t(
            'This permanently removes your account, your entire family, all child accounts, agreements, reviews and rewards, including unfinished ones. With no family setup, only your account is removed. Shared or multiple-family accounts need review. This cannot be undone.',
          )}
        </Text>
        <Text
          allowFontScaling={false}
          style={type.body}
          className="text-home-muted"
        >
          {t(
            'Processing continues in the background. Devices lose family access. Existing offline copies and already sent notifications cannot be remotely recalled. Minimal recovery records remain for seven days after completion; provider diagnostics/logs have separate retention.',
          )}
        </Text>
        <FormMessage message={message} />
        {confirming ? (
          <>
            <PasswordField
              label={t('Verify your password')}
              value={password}
              onChangeText={setPassword}
              editable={!busy}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="current-password"
            />
            <Button
              label={t('Permanently delete account and family')}
              loading={busy}
              disabled={!password || busy}
              onPress={() => void remove()}
            />
            <Button
              label={t('Cancel')}
              variant="secondary"
              disabled={busy}
              onPress={() => {
                setPassword('');
                setConfirming(false);
                setMessage(undefined);
              }}
            />
          </>
        ) : (
          <Button
            label={t('Delete account…')}
            variant="secondary"
            onPress={() => setConfirming(true)}
          />
        )}
      </View>
    </Screen>
  );
}
