import { Text, View } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Screen, useDynamicTypeStyles } from '@chorex/ui';
import { useChildSession } from '../../src/auth/session';
import { ContractDetail } from '../../src/contracts/ContractDetail';

export default function ContractScreen() {
  const { contractId } = useLocalSearchParams<{
    contractId: string | string[];
  }>();
  const session = useChildSession();
  const router = useRouter();
  const styles = useDynamicTypeStyles();

  if (!session.user) return <Redirect href="/" />;
  const id = typeof contractId === 'string' ? contractId : '';
  return (
    <Screen>
      <View className="gap-5">
        <Text
          allowFontScaling={false}
          accessibilityRole="header"
          className="font-bold text-text"
          style={styles.title}
        >
          Contract
        </Text>
        <ContractDetail
          key={`${session.user.uid}:${id}`}
          contractId={id}
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
