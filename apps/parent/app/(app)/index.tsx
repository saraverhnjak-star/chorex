import { useCallback, useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ActivityIndicator, Text, View } from 'react-native';
import {
  createFamilyInputSchema,
  type CreateFamilyInput,
  type CreateFamilyInputValue,
  type PersistedParentProfile,
} from '@chorex/domain';
import {
  createFamily,
  readCurrentParentProfile,
} from '@chorex/firebase-client';
import {
  Button,
  FormMessage,
  Screen,
  TextField,
  amberAuroraColors,
  useDynamicTypeStyles,
} from '@chorex/ui';
import { getAuthErrorMessage } from '../../src/auth/messages';
import { useParentSession } from '../../src/auth/session';
import { getFamilyErrorMessage } from '../../src/family/messages';

type ProfileState =
  | { status: 'loading' }
  | { status: 'onboarding' }
  | { status: 'ready'; profile: PersistedParentProfile }
  | { status: 'error'; message: string };

function ScreenHeading() {
  const dynamicType = useDynamicTypeStyles();
  return (
    <>
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
    </>
  );
}

export default function AuthenticatedHomeScreen() {
  const { user, signOut } = useParentSession();
  const uid = user?.uid;
  const dynamicType = useDynamicTypeStyles();
  const [profileState, setProfileState] = useState<ProfileState>({
    status: 'loading',
  });
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string>();
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateFamilyInputValue, unknown, CreateFamilyInput>({
    resolver: zodResolver(createFamilyInputSchema),
    defaultValues: { displayName: '', familyName: '' },
  });

  const loadProfile = useCallback(async () => {
    setProfileState({ status: 'loading' });
    try {
      const profile = await readCurrentParentProfile();
      setProfileState(
        profile ? { status: 'ready', profile } : { status: 'onboarding' },
      );
    } catch (error) {
      setProfileState({
        status: 'error',
        message: getFamilyErrorMessage(error),
      });
    }
  }, []);

  useEffect(() => {
    if (!uid) return;
    let active = true;
    void readCurrentParentProfile()
      .then((profile) => {
        if (active) {
          setProfileState(
            profile ? { status: 'ready', profile } : { status: 'onboarding' },
          );
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setProfileState({
            status: 'error',
            message: getFamilyErrorMessage(error),
          });
        }
      });
    return () => {
      active = false;
    };
  }, [uid]);

  const onCreateFamily = async (input: CreateFamilyInput) => {
    try {
      const output = await createFamily(input);
      setProfileState({ status: 'ready', profile: output.profile });
    } catch (error) {
      setError('root.family', { message: getFamilyErrorMessage(error) });
    }
  };

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError(undefined);
    try {
      await signOut();
    } catch (error) {
      setSignOutError(getAuthErrorMessage(error));
      setSigningOut(false);
    }
  };

  if (!user) return null;

  return (
    <Screen>
      <View className="py-6">
        <ScreenHeading />

        {profileState.status === 'loading' ? (
          <View className="flex-1 items-center justify-center py-16">
            <ActivityIndicator
              accessibilityLabel="Loading your Parent profile"
              color={amberAuroraColors.primaryPressed}
              size="large"
            />
            <Text
              allowFontScaling={false}
              className="mt-4 text-text-muted"
              style={dynamicType.body}
            >
              Loading your family…
            </Text>
          </View>
        ) : null}

        {profileState.status === 'error' ? (
          <View className="mt-8 gap-4">
            <FormMessage message={profileState.message} />
            <Button label="Try again" onPress={loadProfile} />
          </View>
        ) : null}

        {profileState.status === 'onboarding' ? (
          <View className="mt-8 gap-5 rounded-3xl border border-border bg-surface-warm p-5">
            <Text
              allowFontScaling={false}
              className="font-bold text-text"
              style={dynamicType.title}
            >
              Create your family
            </Text>
            <Text
              allowFontScaling={false}
              className="text-text-muted"
              style={dynamicType.body}
            >
              Tell us what to call you and your family to finish Parent setup.
            </Text>
            <FormMessage message={errors.root?.family?.message} />
            <Controller
              control={control}
              name="displayName"
              render={({ field }) => (
                <TextField
                  autoCapitalize="words"
                  autoComplete="name"
                  editable={!isSubmitting}
                  error={errors.displayName?.message}
                  label="Your name"
                  onBlur={field.onBlur}
                  onChangeText={field.onChange}
                  returnKeyType="next"
                  textContentType="name"
                  value={field.value}
                />
              )}
            />
            <Controller
              control={control}
              name="familyName"
              render={({ field }) => (
                <TextField
                  autoCapitalize="words"
                  editable={!isSubmitting}
                  error={errors.familyName?.message}
                  label="Family name"
                  onBlur={field.onBlur}
                  onChangeText={field.onChange}
                  onSubmitEditing={handleSubmit(onCreateFamily)}
                  returnKeyType="done"
                  value={field.value}
                />
              )}
            />
            <Button
              label="Create family"
              loading={isSubmitting}
              onPress={handleSubmit(onCreateFamily)}
            />
          </View>
        ) : null}

        {profileState.status === 'ready' ? (
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
                Family setup complete
              </Text>
            </View>
            <Text
              allowFontScaling={false}
              className="mt-4 text-text-muted"
              style={dynamicType.body}
            >
              Welcome, {profileState.profile.displayName}.
            </Text>
          </View>
        ) : null}

        {profileState.status !== 'loading' ? (
          <View className="mt-6 gap-4">
            <FormMessage message={signOutError} />
            <Button
              label="Sign out"
              loading={signingOut}
              onPress={handleSignOut}
              variant="secondary"
            />
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
