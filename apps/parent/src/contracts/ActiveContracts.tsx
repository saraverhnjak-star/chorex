import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  useActiveContracts,
  useReadyForReviewContracts,
  type ActiveContractsState,
} from '@chorex/firebase-client';
import { Button, FormMessage, useDynamicTypeStyles } from '@chorex/ui';

type ContractListProps = {
  familyId: string;
  authUid: string;
  childNames?: Readonly<Record<string, string>>;
};
export function ActiveContracts({
  familyId,
  authUid,
  childNames = {},
}: ContractListProps) {
  const state = useActiveContracts(familyId, authUid);
  return (
    <ContractList
      state={state}
      childNames={childNames}
      readyForReview={false}
    />
  );
}
export function ReadyForReviewContracts({
  familyId,
  authUid,
  childNames = {},
}: ContractListProps) {
  const state = useReadyForReviewContracts(familyId, authUid);
  return <ContractList state={state} childNames={childNames} readyForReview />;
}
function ContractList({
  state,
  childNames,
  readyForReview,
}: {
  state: ActiveContractsState;
  childNames: Readonly<Record<string, string>>;
  readyForReview: boolean;
}) {
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
        {readyForReview ? 'Ready for Review' : 'Active Contracts'}
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
                ? readyForReview
                  ? 'No Contracts awaiting review are saved on this device yet.'
                  : 'No active Contracts are saved on this device yet.'
                : readyForReview
                  ? 'No Contracts awaiting review.'
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
