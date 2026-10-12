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
import { StatusTabs } from '../navigation/StatusTabs';
import { useRouter } from 'expo-router';
import { useLayoutEffect, useState } from 'react';
import { HomeContractRow } from './HomeContractRow';
import { Text, View } from 'react-native';
import {
  useActiveContracts,
  useReadyForReviewContracts,
  useContractsInState,
  type ActiveContractsState,
} from '@chorex/firebase-client';

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
  useAppLanguage();

  const active = useActiveContracts(familyId, authUid);
  const review = useReadyForReviewContracts(familyId, authUid);
  const changes = useContractsInState(familyId, authUid, 'CHANGES_REQUESTED');
  const [selected, setSelected] = useState('Your turn');
  const states = [active, review, changes];
  const all = states.flatMap((s) => (s.status === 'ready' ? s.contracts : []));
  const visible = preview
    ? all
    : all.filter((c) =>
        selected === 'Your turn'
          ? c.status === 'ACTIVE' || c.status === 'CHANGES_REQUESTED'
          : c.status === 'READY_FOR_REVIEW',
      );
  const state: ActiveContractsState = states.some((s) => s.status === 'error')
    ? { status: 'error' }
    : states.some((s) => s.status === 'loading')
      ? { status: 'loading' }
      : {
          status: 'ready',
          contracts: visible,
          fromCache: states.some((s) => s.status === 'ready' && s.fromCache),
        };
  const router = useRouter();
  const styles = useDynamicTypeStyles();
  const empty = state.status === 'ready' && all.length === 0;
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
        title={t('No agreements yet')}
        centered
        illustration="no-chores"
      >
        {state.status === 'ready' && state.fromCache
          ? t('No active Contracts are saved on this device yet.')
          : t('Your agreements will appear here.')}
      </OfferOutcome>
    );
  return (
    <View
      className={preview ? 'gap-3' : 'gap-4'}
      style={!preview ? { flexGrow: 1 } : undefined}
    >
      {!preview && all.length > 0 ? (
        <StatusTabs
          labels={['Your turn', "Parent's turn"]}
          tone="blue"
          counts={{
            'Your turn': all.filter(
              (c) => c.status === 'ACTIVE' || c.status === 'CHANGES_REQUESTED',
            ).length,
            "Parent's turn": all.filter((c) => c.status === 'READY_FOR_REVIEW')
              .length,
          }}
          selected={selected}
          onSelect={setSelected}
        />
      ) : null}
      {preview ? (
        <CollectionHeading
          label={t('See all My chores')}
          onSeeAll={() => router.navigate('/contracts')}
        >
          {t('My agreement')}
        </CollectionHeading>
      ) : null}
      {state.status === 'error' ? (
        <>
          <FormMessage
            message={t('Your Contracts could not be loaded. Try again.')}
          />
          {onRetry ? (
            <Button
              variant="outline"
              label={t('Try Contracts again')}
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
                title={
                  selected === "Parent's turn"
                    ? t('Nothing waiting for review')
                    : t('No agreements to work on')
                }
                centered
                illustration="no-chores"
              >
                {state.fromCache
                  ? t('No active Contracts are saved on this device yet.')
                  : t('Your agreements will appear here.')}
              </OfferOutcome>
            )
          ) : (
            (preview ? state.contracts.slice(0, 1) : state.contracts).map(
              (contract) => (
                <HomeContractRow
                  preview
                  showTasks={preview}
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
