import { useState } from 'react';
import { HomeContractRow } from './HomeContractRow';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useActiveContracts } from '@chorex/firebase-client';
import {
  Button,
  CountBadge,
  OfferOutcome,
  FormMessage,
  useDynamicTypeStyles,
} from '@chorex/ui';

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
  const [expanded, setExpanded] = useState(false);
  const router = useRouter();
  const styles = useDynamicTypeStyles();
  return (
    <View className="gap-4 rounded-3xl border border-home-border bg-home-surface p-5">
      <Text
        allowFontScaling={false}
        accessibilityRole="header"
        className="font-bold text-home-text"
        style={[styles.body, { fontSize: 21 }]}
      >
        Active Contracts
      </Text>
      {state.status === 'ready' ? (
        <CountBadge count={state.contracts.length} />
      ) : null}
      {state.status === 'loading' ? (
        <Text
          allowFontScaling={false}
          accessibilityLiveRegion="polite"
          className="text-home-muted"
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
              className="text-home-muted"
              style={styles.small}
            >
              Showing saved data. Updates may be pending.
            </Text>
          ) : null}
          {state.contracts.length === 0 ? (
            <OfferOutcome title="No active agreements">
              {state.fromCache
                ? 'No active Contracts are saved on this device yet.'
                : 'No active Contracts yet.'}
            </OfferOutcome>
          ) : (
            (expanded ? state.contracts : state.contracts.slice(0, 2)).map(
              (contract) => (
                <HomeContractRow
                  key={contract.id}
                  contract={contract}
                  authUid={authUid}
                  childName={childNames[contract.childUid]}
                  onPress={() =>
                    router.push({
                      pathname: '/contracts/[contractId]',
                      params: { contractId: contract.id },
                    })
                  }
                />
              ),
            )
          )}
          {state.contracts.length > 2 ? (
            <Button
              label={
                expanded
                  ? 'Show fewer Contracts'
                  : `View all Contracts (${state.contracts.length})`
              }
              variant="secondary"
              onPress={() => setExpanded((value) => !value)}
            />
          ) : null}
        </>
      ) : null}
    </View>
  );
}
