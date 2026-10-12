import {
  t,
  useAppLanguage,
  Button,
  HomeEmptyState,
  CollectionHeading,
  OfferOutcome,
  FormMessage,
  useDynamicTypeStyles,
} from '@chorex/ui';
import { useState } from 'react';
import { HomeContractRow } from './HomeContractRow';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  useActiveContracts,
  useReadyForReviewContracts,
  type ActiveContractsState,
} from '@chorex/firebase-client';

type ContractListProps = {
  showHeading?: boolean;
  selectedChildUid?: string;
  familyId: string;
  authUid: string;
  onRetry?: () => void;
  preview?: boolean;
  childNames?: Readonly<Record<string, string>>;
};
function ActiveContractsContent({
  familyId,
  authUid,
  childNames = {},
  preview = false,
  showHeading = true,
  selectedChildUid,
  onRetry,
}: ContractListProps) {
  const state = useActiveContracts(familyId, authUid);
  return (
    <ContractList
      onRetry={onRetry}
      preview={preview}
      showHeading={showHeading}
      authUid={authUid}
      state={
        state.status === 'ready' && selectedChildUid
          ? {
              ...state,
              contracts: state.contracts.filter(
                (contract) => contract.childUid === selectedChildUid,
              ),
            }
          : state
      }
      childNames={childNames}
      readyForReview={false}
    />
  );
}
function ReadyForReviewContractsContent({
  familyId,
  authUid,
  childNames = {},
  preview = false,
  showHeading = true,
  selectedChildUid,
  onRetry,
}: ContractListProps) {
  const state = useReadyForReviewContracts(familyId, authUid);
  return (
    <ContractList
      onRetry={onRetry}
      preview={preview}
      showHeading={showHeading}
      authUid={authUid}
      state={
        state.status === 'ready' && selectedChildUid
          ? {
              ...state,
              contracts: state.contracts.filter(
                (contract) => contract.childUid === selectedChildUid,
              ),
            }
          : state
      }
      childNames={childNames}
      readyForReview
    />
  );
}
function ContractList({
  state,
  authUid,
  childNames,
  onRetry,
  readyForReview,
  preview,
  showHeading,
}: {
  state: ActiveContractsState;
  authUid: string;
  childNames: Readonly<Record<string, string>>;
  onRetry?: () => void;
  readyForReview: boolean;
  preview: boolean;
  showHeading: boolean;
}) {
  useAppLanguage();

  const router = useRouter();
  const styles = useDynamicTypeStyles();
  if (state.status === 'loading') return null;
  if (preview && state.status === 'ready' && state.contracts.length === 0)
    return null;
  return (
    <View className="gap-4">
      {showHeading ? (
        <CollectionHeading
          count={
            !preview && state.status === 'ready'
              ? state.contracts.length
              : undefined
          }
          label={readyForReview ? t('See all Reviews') : t('See all Contracts')}
          onSeeAll={preview ? () => router.navigate('/contracts') : undefined}
        >
          {readyForReview
            ? t('Ready for Review')
            : preview
              ? t('Active agreements')
              : t('Active Contracts')}
        </CollectionHeading>
      ) : null}

      {state.status === 'error' ? (
        <>
          <FormMessage
            message={t('Your Contracts could not be loaded. Try again.')}
          />
          {onRetry ? (
            <Button label={t('Try Contracts again')} onPress={onRetry} />
          ) : null}
        </>
      ) : null}
      {state.status === 'ready' ? (
        <>
          {state.fromCache ? (
            <Text
              allowFontScaling={false}
              className="text-home-muted"
              style={
                preview
                  ? {
                      ...styles.small,
                      fontSize: (styles.small.fontSize ?? 14) * (12 / 14),
                    }
                  : styles.small
              }
            >
              {t('Showing saved data. Updates may be pending.')}
            </Text>
          ) : null}
          {state.contracts.length === 0 ? (
            preview ? (
              <HomeEmptyState>
                {state.fromCache
                  ? t('No active agreements saved yet.')
                  : t('No active agreements')}
              </HomeEmptyState>
            ) : (
              <OfferOutcome
                centered
                illustration="no-chores"
                title={
                  readyForReview
                    ? t('Nothing waiting for review')
                    : t('No active agreements')
                }
              >
                {state.fromCache
                  ? readyForReview
                    ? t(
                        'No Contracts awaiting review are saved on this device yet.',
                      )
                    : t('No active Contracts are saved on this device yet.')
                  : readyForReview
                    ? t('No Contracts awaiting review.')
                    : t('No active Contracts yet.')}
              </OfferOutcome>
            )
          ) : (
            (preview ? state.contracts.slice(0, 3) : state.contracts).map(
              (contract) => (
                <HomeContractRow
                  preview={preview}
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

export function ReadyForReviewContracts(
  props: Parameters<typeof ReadyForReviewContractsContent>[0],
) {
  const [attempt, setAttempt] = useState(0);
  return (
    <>
      <ReadyForReviewContractsContent
        key={attempt}
        {...props}
        onRetry={() => setAttempt((value) => value + 1)}
      />
    </>
  );
}
