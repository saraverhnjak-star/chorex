import {
  t,
  useAppLanguage,
  Button,
  EntryHeading,
  amberAuroraPalette,
  FormMessage,
  Screen,
  TextField,
  useDynamicTypeStyles,
} from '@chorex/ui';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import {
  parentPasswordMinimumLength,
  registrationCredentialsSchema,
  type RegistrationCredentials,
  type RegistrationCredentialsInput,
} from '@chorex/domain';
import { PasswordField } from '../src/auth/PasswordField';
import { getAuthErrorMessage } from '../src/auth/messages';
import { useParentSession } from '../src/auth/session';

export default function RegisterScreen() {
  useAppLanguage();

  const { register } = useParentSession();
  const dynamicType = useDynamicTypeStyles();
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegistrationCredentialsInput, unknown, RegistrationCredentials>({
    resolver: zodResolver(registrationCredentialsSchema),
    defaultValues: { email: '', password: '', confirmPassword: '' },
  });

  const onSubmit = async (credentials: RegistrationCredentials) => {
    try {
      await register({
        email: credentials.email,
        password: credentials.password,
      });
    } catch (error) {
      setError('root.auth', { message: getAuthErrorMessage(error) });
    }
  };

  return (
    <Screen design entry>
      <View className="py-6">
        <EntryHeading
          showIcon={false}
          title={t('Create your account')}
          description={t('Start with your account. Your family comes next.')}
        />

        <View className="mt-6 gap-5">
          <FormMessage message={errors.root?.auth?.message} />
          <Controller
            control={control}
            name="email"
            render={({ field }) => (
              <TextField
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                editable={!isSubmitting}
                error={errors.email?.message}
                keyboardType="email-address"
                label={t('Email')}
                onBlur={field.onBlur}
                onChangeText={field.onChange}
                returnKeyType="next"
                textContentType="username"
                value={field.value}
              />
            )}
          />
          <Controller
            control={control}
            name="password"
            render={({ field }) => (
              <PasswordField
                autoCapitalize="none"
                autoComplete="new-password"
                editable={!isSubmitting}
                error={errors.password?.message}
                label={t('Password')}
                onBlur={field.onBlur}
                onChangeText={field.onChange}
                returnKeyType="next"
                textContentType="newPassword"
                value={field.value}
              />
            )}
          />
          <Text
            allowFontScaling={false}
            className="-mt-3 text-home-muted"
            style={dynamicType.small}
          >
            {t('Use at least {0} characters.', {
              '0': parentPasswordMinimumLength,
            })}
          </Text>
          <Controller
            control={control}
            name="confirmPassword"
            render={({ field }) => (
              <PasswordField
                autoCapitalize="none"
                autoComplete="new-password"
                editable={!isSubmitting}
                error={errors.confirmPassword?.message}
                label={t('Confirm password')}
                onBlur={field.onBlur}
                onChangeText={field.onChange}
                onSubmitEditing={handleSubmit(onSubmit)}
                returnKeyType="done"
                textContentType="newPassword"
                value={field.value}
              />
            )}
          />
          <Button
            variant="blue"
            lightText
            label={t('Create account')}
            loading={isSubmitting}
            onPress={handleSubmit(onSubmit)}
          />
        </View>

        <View className="mt-6 items-center">
          <Text
            allowFontScaling={false}
            className="text-home-muted"
            style={dynamicType.body}
          >
            {t('Already registered?')}
          </Text>
          <Link href="/sign-in" asChild>
            <Pressable
              accessibilityRole="link"
              className="min-h-12 justify-center px-4 py-3"
            >
              <Text
                allowFontScaling={false}
                className="font-semibold underline"
                style={[
                  dynamicType.body,
                  { color: amberAuroraPalette.auroraBlue },
                ]}
              >
                {t('Return to sign in')}
              </Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </Screen>
  );
}
