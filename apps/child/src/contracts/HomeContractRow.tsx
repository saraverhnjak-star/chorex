import {
  t,
  useAppLanguage,
  dateLocale,
  HomeListRow,
  HomeFeatureCard,
  HomeCardAction,
  DesignText,
  homeTokens,
  contractStatusLabel,
} from '@chorex/ui';
import { View } from 'react-native';
import type { Contract } from '@chorex/domain';
import { useContractDetail } from '@chorex/firebase-client';
export function HomeContractRow({
  contract,
  authUid,
  childName,
  onPress,
  preview = false,
  showTasks = true,
}: {
  showTasks?: boolean;
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
  if (preview)
    return (
      <HomeFeatureCard
        tone="blue"
        title={contract.rewardTerms.title}
        detail={t('Due {0}{1}', {
          '0': new Date(contract.deadlineAt).toLocaleDateString(dateLocale()),
          '1': childName ? ` · ${childName}` : '',
        })}
        reward={contract.rewardTerms}
        badge={contractStatusLabel(contract.status, 'CHILD')}
      >
        {progress ? (
          <View style={{ gap: 8 }}>
            <View
              accessible
              accessibilityRole="progressbar"
              accessibilityValue={{
                min: 0,
                max: progress.required,
                now: progress.completed,
              }}
              style={{
                height: 10,
                borderRadius: homeTokens.radius.pill,
                backgroundColor: homeTokens.surface,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  height: 10,
                  backgroundColor: homeTokens.success,
                  width: `${progress.required ? Math.min(100, (progress.completed / progress.required) * 100) : 0}%`,
                }}
              />
            </View>
            <DesignText style={{ fontSize: 13, color: homeTokens.secondary }}>
              {progress.completed} / {progress.required} {t('completions')}
            </DesignText>
          </View>
        ) : null}
        {state.status === 'ready' ? (
          <>
            {state.fromCache ? (
              <DesignText style={{ fontSize: 12, color: homeTokens.secondary }}>
                {t('Saved progress. Updates may be pending.')}
              </DesignText>
            ) : null}
            {showTasks &&
              state.tasks.map((task) => (
                <View
                  key={task.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    backgroundColor: homeTokens.surface,
                    borderRadius: homeTokens.radius.card,
                    padding: homeTokens.spacing.medium,
                  }}
                >
                  <DesignText
                    style={{ flex: 1, fontSize: 17, color: homeTokens.text }}
                  >
                    {task.title}
                  </DesignText>
                  <DesignText
                    accessibilityLabel={t(
                      '{0}: {1} of {2} completions recorded',
                      {
                        '0': task.title,
                        '1': task.completedCount,
                        '2': task.targetCount,
                      },
                    )}
                    style={{
                      fontSize: 18,
                      fontWeight: '700',
                      color: homeTokens.success,
                    }}
                  >
                    {task.completedCount >= task.targetCount
                      ? '✓'
                      : `${task.completedCount} / ${task.targetCount}`}
                  </DesignText>
                </View>
              ))}
          </>
        ) : (
          <DesignText style={{ fontSize: 13, color: homeTokens.secondary }}>
            {state.status === 'error'
              ? t('Progress unavailable')
              : t('Loading progress…')}
          </DesignText>
        )}
        <HomeCardAction
          label={t('Open agreement')}
          accessibilityLabel={t('Open Contract: {0}', {
            '0': contract.rewardTerms.title,
          })}
          onPress={onPress}
        />
      </HomeFeatureCard>
    );
  return (
    <HomeListRow
      reward={contract.rewardTerms}
      title={contract.rewardTerms.title}
      label={t('Open Contract: {0}{1}', {
        '0': childName ? `${childName} · ` : '',
        '1': contract.rewardTerms.title,
      })}
      detail={t('{0}{1} · Due {2}{3}', {
        '0': childName ? `${childName} · ` : '',
        '1': contractStatusLabel(contract.status, 'CHILD'),
        '2': new Date(contract.deadlineAt).toLocaleDateString(dateLocale()),
        '3':
          state.status === 'error'
            ? ` · ${t('Progress unavailable')}`
            : state.status === 'ready' && state.fromCache
              ? ` · ${t('Saved progress')}`
              : '',
      })}
      progress={progress}
      progressTone="green"
      onPress={onPress}
    />
  );
}
