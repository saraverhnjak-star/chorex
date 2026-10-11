import {
  t,
  useAppLanguage,
  dateLocale,
  CompletionBar,
  DesignText,
  homeTokens,
} from '@chorex/ui';
import { ParentHomeCard, ParentHomeRow } from '../navigation/ParentHomeRow';
import type { Contract } from '@chorex/domain';
import { useContractDetail } from '@chorex/firebase-client';
export function HomeContractRow({
  contract,
  authUid,
  childName,
  onPress,
  preview = false,
}: {
  preview?: boolean;
  contract: Contract;
  authUid: string;
  childName?: string;
  onPress: () => void;
}) {
  useAppLanguage();

  const state = useContractDetail(contract.id, authUid);
  const progress =
    state.status === 'ready'
      ? {
          completed: state.tasks.reduce(
            (sum, task) => sum + task.completedCount,
            0,
          ),
          required: state.tasks.reduce(
            (sum, task) => sum + task.targetCount,
            0,
          ),
        }
      : undefined;
  return (
    <ParentHomeCard>
      <ParentHomeRow
        dense={preview}
        title={contract.rewardTerms.title}
        detail={t('{0}{1}Due {2}', {
          '0': childName ? `${childName} · ` : '',
          '1':
            contract.status === 'READY_FOR_REVIEW' ? 'Ready for review · ' : '',
          '2': new Date(contract.deadlineAt).toLocaleDateString(dateLocale()),
        })}
        reward={contract.rewardTerms}
        artRight
        label={t('Open Contract: {0}{1}', {
          '0': childName ? `${childName} · ` : '',
          '1': contract.rewardTerms.title,
        })}
        onPress={onPress}
      >
        {progress ? (
          <>
            <CompletionBar
              completed={progress.completed}
              required={progress.required}
            />
            <DesignText style={{ fontSize: 13, color: homeTokens.secondary }}>
              {t('{0} of {1} completions', {
                '0': progress.completed,
                '1': progress.required,
              })}
            </DesignText>
          </>
        ) : (
          <DesignText style={{ fontSize: 13, color: homeTokens.secondary }}>
            {state.status === 'error'
              ? t('Progress unavailable')
              : t('Loading progress…')}
          </DesignText>
        )}
        {state.status === 'ready' && state.fromCache ? (
          <DesignText style={{ fontSize: 12, color: homeTokens.secondary }}>
            {t('Saved progress. Updates may be pending.')}
          </DesignText>
        ) : null}
      </ParentHomeRow>
    </ParentHomeCard>
  );
}
