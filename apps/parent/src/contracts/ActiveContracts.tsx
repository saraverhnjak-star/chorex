import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useActiveContracts } from '@chorex/firebase-client';
import { Button, FormMessage, useDynamicTypeStyles } from '@chorex/ui';

export function ActiveContracts({
  familyId,
  authUid,
  childNames = {},
}: {
  familyId: string;
  authUid: string;
  childNames?: Readonly<Record<string, string>>;
}) {
  const state = useActiveContracts(familyId, authUid);
  const router = useRouter();
  const styles = useDynamicTypeStyles();
  return (
    <View className="gap-4 rounded-3xl border border-border bg-surface-warm p-5">
      <Text
        allowFontScaling={false}
        accessibilityRole="header"
        className="font-bold text-text"
        style={styles.title}
      >
        Active Contracts
      </Text>
      {state.status === 'loading' ? (
        <Text
          allowFontScaling={false}
          accessibilityLiveRegion="polite"
          className="text-text-muted"
          style={styles.body}
        >
          Loading Contracts…
        </Text>
      ) : null}
      {state.status === 'error' ? (
        <FormMessage message="Your Contracts could not be loaded. Reopen this screen to try again." />
      ) : null}
      {state.status === 'ready' ? (
        <>
          {state.fromCache ? (
            <Text
              allowFontScaling={false}
              className="text-text-muted"
              style={styles.small}
            >
              Showing saved data. Updates may be pending.
            </Text>
          ) : null}
          {state.contracts.length === 0 ? (
            <Text
              allowFontScaling={false}
              className="text-text-muted"
              style={styles.body}
            >
              {state.fromCache
                ? 'No active Contracts are saved on this device yet.'
                : 'No active Contracts yet.'}
            </Text>
          ) : (
            state.contracts.map((contract) => (
              <Button
                key={contract.id}
                label={`Open Contract: ${childNames[contract.childUid] ? `${childNames[contract.childUid]} · ` : ''}${contract.rewardTerms.title}`}
                variant="secondary"
                onPress={() =>
                  router.push({
                    pathname: '/contracts/[contractId]',
                    params: { contractId: contract.id },
                  })
                }
              />
            ))
          )}
        </>
      ) : null}
    </View>
  );
}
