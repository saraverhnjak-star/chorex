import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import {
  signInCredentialsSchema,
  type SignInCredentials,
  type SignInCredentialsInput,
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

export default function SignInScreen() {
  const { signIn } = useParentSession();
  const dynamicType = useDynamicTypeStyles();
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignInCredentialsInput, unknown, SignInCredentials>({
    resolver: zodResolver(signInCredentialsSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (credentials: SignInCredentials) => {
    try {
      await signIn(credentials);
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
          ChoreX Parent
        </Text>
        <Text
          allowFontScaling={false}
          className="mt-3 text-text-muted"
          style={dynamicType.body}
        >
          Sign in to continue your family&apos;s agreements.
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
                autoComplete="current-password"
                editable={!isSubmitting}
                error={errors.password?.message}
                label="Password"
                onBlur={field.onBlur}
                onChangeText={field.onChange}
                onSubmitEditing={handleSubmit(onSubmit)}
                returnKeyType="done"
                textContentType="password"
                value={field.value}
              />
            )}
          />
          <Button
            label="Sign in"
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
            New to ChoreX?
          </Text>
          <Link href="/register" asChild>
            <Pressable
              accessibilityRole="link"
              className="min-h-12 justify-center px-4 py-3"
            >
              <Text
                allowFontScaling={false}
                className="font-semibold text-text underline"
                style={dynamicType.body}
              >
                Create a parent account
              </Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </Screen>
  );
}
