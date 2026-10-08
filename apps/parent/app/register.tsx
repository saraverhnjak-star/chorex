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
  EntryHeading,
  homeTokens,
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
    <Screen design entry>
      <View className="py-6">
        <EntryHeading
          title="Create your account"
          description="Start with your account. Your family comes next."
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
            className="-mt-3 text-home-muted"
            style={dynamicType.small}
          >
            Use at least {parentPasswordMinimumLength} characters.
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
            className="text-home-muted"
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
                className="font-semibold underline"
                style={[dynamicType.body, { color: homeTokens.coral }]}
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
