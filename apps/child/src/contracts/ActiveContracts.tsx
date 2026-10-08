import { useState } from 'react';
import { HomeContractRow } from './HomeContractRow';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useActiveContracts } from '@chorex/firebase-client';
import {
  Button,
  CollectionHeading,
  CountBadge,
  OfferOutcome,
  FormMessage,
  useDynamicTypeStyles,
} from '@chorex/ui';

function ActiveContractsContent({
  familyId,
  authUid,
  childNames = {},
  preview = false,
  onRetry,
}: {
  onRetry?: () => void;
  preview?: boolean;
  familyId: string;
  authUid: string;
  childNames?: Readonly<Record<string, string>>;
}) {
  const state = useActiveContracts(familyId, authUid);
  const router = useRouter();
  const styles = useDynamicTypeStyles();
  return (
    <View className="gap-4 rounded-3xl border border-home-border bg-home-surface p-5">
      <CollectionHeading
        label="See all My chores"
        onSeeAll={preview ? () => router.navigate('/contracts') : undefined}
      >
        Active agreements
      </CollectionHeading>
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
        <>
          <FormMessage message="Your Contracts could not be loaded. Try again." />
          {onRetry ? (
            <Button label="Try Contracts again" onPress={onRetry} />
          ) : null}
        </>
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
            (preview ? state.contracts.slice(0, 2) : state.contracts).map(
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
        </>
      ) : null}
    </View>
  );
}

export function ActiveContracts(
  props: Parameters<typeof ActiveContractsContent>[0],
) {
  const [attempt, setAttempt] = useState(0);
  return (
    <>
      <ActiveContractsContent
        key={attempt}
        {...props}
        onRetry={() => setAttempt((value) => value + 1)}
      />
    </>
  );
}
