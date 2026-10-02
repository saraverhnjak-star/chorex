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
import {
  Button,
  FormMessage,
  Screen,
  TextField,
  useDynamicTypeStyles,
} from '@chorex/ui';
import { PasswordField } from '../src/auth/PasswordField';
import { getAuthErrorMessage } from '../src/auth/messages';
import { useParentSession } from '../src/auth/session';

export default function RegisterScreen() {
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
          Create your account
        </Text>
        <Text
          allowFontScaling={false}
          className="mt-3 text-text-muted"
          style={dynamicType.body}
        >
          Start with a local development account. Family setup comes next.
        </Text>

        <View className="mt-8 gap-5 rounded-3xl border border-border bg-surface-warm p-5">
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
                label="Email"
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
                label="Password"
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
            className="-mt-3 text-text-muted"
            style={dynamicType.small}
          >
            Use at least {parentPasswordMinimumLength} characters. This
            development minimum is not the final production policy.
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
                label="Confirm password"
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
            label="Create account"
            loading={isSubmitting}
            onPress={handleSubmit(onSubmit)}
          />
        </View>

        <View className="mt-6 items-center">
          <Text
            allowFontScaling={false}
            className="text-text-muted"
            style={dynamicType.body}
          >
            Already registered?
          </Text>
          <Link href="/sign-in" asChild>
            <Pressable
              accessibilityRole="link"
              className="min-h-12 justify-center px-4 py-3"
            >
              <Text
                allowFontScaling={false}
                className="font-semibold text-text underline"
                style={dynamicType.body}
              >
                Return to sign in
              </Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </Screen>
  );
}
