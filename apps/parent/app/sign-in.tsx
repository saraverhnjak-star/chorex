import { useRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'expo-router';
import { Pressable, Text, View, type TextInput } from 'react-native';
import {
  signInCredentialsSchema,
  type SignInCredentials,
  type SignInCredentialsInput,
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

export default function SignInScreen() {
  const password = useRef<TextInput>(null);
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
    <Screen design entry>
      <View className="py-6">
        <EntryHeading
          title="Welcome back"
          description="Sign in to continue your family’s agreements."
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
                onSubmitEditing={() => password.current?.focus()}
                submitBehavior="submit"
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
                ref={password}
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
            className="text-home-muted"
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
                className="font-semibold underline"
                style={[dynamicType.body, { color: homeTokens.coralText }]}
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
