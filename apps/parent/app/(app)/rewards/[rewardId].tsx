import { useEffect, useState } from 'react';
import {
  readCurrentParentFamily,
  type ParentFamilyHome,
} from '@chorex/firebase-client';
import { Text, View } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Screen, useDynamicTypeStyles } from '@chorex/ui';
import { useParentSession } from '../../../src/auth/session';
import { RewardDetail } from '../../../src/rewards/RewardDetail';

export default function RewardScreen() {
  const { rewardId } = useLocalSearchParams<{
    rewardId: string | string[];
  }>();
  const session = useParentSession();
  const router = useRouter();
  const styles = useDynamicTypeStyles();
  const [home, setHome] = useState<ParentFamilyHome | null>(null);
  useEffect(() => {
    let active = true;
    if (session.user)
      void readCurrentParentFamily()
        .then((value) => {
          if (active) setHome(value);
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [session.user]);
  if (!session.user) return <Redirect href="/" />;
  const id = typeof rewardId === 'string' ? rewardId : '';
  return (
    <Screen design>
      <View className="gap-5">
        <Text
          allowFontScaling={false}
          accessibilityRole="header"
          className="font-bold text-home-text"
          style={{
            ...styles.title,
            lineHeight: Number(styles.title.fontSize) * 1.35,
          }}
        >
          Reward
        </Text>
        <RewardDetail
          key={`${session.user.uid}:${id}`}
          rewardId={id}
          authUid={session.user.uid}
          childNames={
            home && home.profile.uid === session.user.uid
              ? Object.fromEntries(
                  home.children.map((child) => [child.uid, child.displayName]),
                )
              : {}
          }
        />
        <Button
          label="Back"
          variant="outline"
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace('/rewards')
          }
        />
      </View>
    </Screen>
  );
}
