import { Text, View } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Screen, useDynamicTypeStyles } from '@chorex/ui';
import { useChildSession } from '../../src/auth/session';
import { RewardDetail } from '../../src/rewards/RewardDetail';

export default function RewardScreen() {
  const { rewardId } = useLocalSearchParams<{
    rewardId: string | string[];
  }>();
  const session = useChildSession();
  const router = useRouter();
  const styles = useDynamicTypeStyles();

  if (!session.user) return <Redirect href="/" />;
  const id = typeof rewardId === 'string' ? rewardId : '';
  return (
    <Screen>
      <View className="gap-5">
        <Text
          allowFontScaling={false}
          accessibilityRole="header"
          className="font-bold text-text"
          style={styles.title}
        >
          Reward
        </Text>
        <RewardDetail
          key={`${session.user.uid}:${id}`}
          rewardId={id}
          authUid={session.user.uid}
        />
        <Button
          label="Back to home"
          variant="secondary"
          onPress={() => router.replace('/')}
        />
      </View>
    </Screen>
  );
}
