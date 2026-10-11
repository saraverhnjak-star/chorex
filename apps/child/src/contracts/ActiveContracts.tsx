import { useRouter } from 'expo-router';
import { useLayoutEffect, useState } from 'react';
import { HomeContractRow } from './HomeContractRow';
import { Text, View } from 'react-native';
import {
  useActiveContracts,
  useReadyForReviewContracts,
  type ActiveContractsState,
} from '@chorex/firebase-client';
import {
  Button,
  HomeEmptyState,
  CollectionHeading,
  SectionHeading,
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
  onEmptyChange,
  onLoadingChange,
}: {
  onRetry?: () => void;
  onEmptyChange?: (empty: boolean) => void;
  onLoadingChange?: (loading: boolean) => void;
  preview?: boolean;
  familyId: string;
  authUid: string;
  childNames?: Readonly<Record<string, string>>;
}) {
  const active = useActiveContracts(familyId, authUid);
  const review = useReadyForReviewContracts(familyId, authUid);
  const state: ActiveContractsState =
    active.status === 'error' || review.status === 'error'
      ? { status: 'error' }
      : active.status === 'loading' || review.status === 'loading'
        ? { status: 'loading' }
        : {
            status: 'ready',
            contracts: [...review.contracts, ...active.contracts],
            fromCache: active.fromCache || review.fromCache,
          };
  const router = useRouter();
  const styles = useDynamicTypeStyles();
  const empty = state.status === 'ready' && state.contracts.length === 0;
  useLayoutEffect(() => {
    onEmptyChange?.(empty);
  }, [empty, onEmptyChange]);
  useLayoutEffect(() => {
    onLoadingChange?.(state.status === 'loading');
  }, [state.status, onLoadingChange]);
  if (state.status === 'loading') return null;
  if (preview && empty) return null;
  if (!preview && empty)
    return (
      <OfferOutcome
        title="No active agreements"
        centered
        illustration="no-chores"
      >
        {state.status === 'ready' && state.fromCache
          ? 'No active Contracts are saved on this device yet.'
          : 'No active Contracts yet.'}
      </OfferOutcome>
    );
  return (
    <View className={preview ? 'gap-3' : 'gap-4'}>
      {preview ? (
        <CollectionHeading
          label="See all My chores"
          onSeeAll={() => router.navigate('/contracts')}
        >
          My agreement
        </CollectionHeading>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <SectionHeading>My agreements</SectionHeading>
          </View>
          {state.status === 'ready' ? (
            <CountBadge count={state.contracts.length} />
          ) : null}
        </View>
      )}

      {state.status === 'error' ? (
        <>
          <FormMessage message="Your Contracts could not be loaded. Try again." />
          {onRetry ? (
            <Button
              variant="outline"
              label="Try Contracts again"
              onPress={onRetry}
            />
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
              Showing saved data. Updates may be pending.
            </Text>
          ) : null}
          {state.contracts.length === 0 ? (
            preview ? (
              <HomeEmptyState>
                {state.fromCache
                  ? 'No active agreements saved yet.'
                  : 'No active agreements'}
              </HomeEmptyState>
            ) : (
              <OfferOutcome
                title="No active agreements"
                centered
                illustration="no-chores"
              >
                {state.fromCache
                  ? 'No active Contracts are saved on this device yet.'
                  : 'No active Contracts yet.'}
              </OfferOutcome>
            )
          ) : (
            (preview ? state.contracts.slice(0, 1) : state.contracts).map(
              (contract) => (
                <HomeContractRow
                  preview
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
