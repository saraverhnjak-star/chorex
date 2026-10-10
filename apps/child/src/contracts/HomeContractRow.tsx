import { View } from 'react-native';
import type { Contract } from '@chorex/domain';
import { useContractDetail } from '@chorex/firebase-client';
import {
  HomeListRow,
  HomeFeatureCard,
  HomeCardAction,
  DesignText,
  homeTokens,
  contractStatusLabel,
} from '@chorex/ui';
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
        title={contract.rewardTerms.title}
        detail={`Due ${new Date(contract.deadlineAt).toLocaleDateString()}${childName ? ` · ${childName}` : ''}`}
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
                backgroundColor: homeTokens.border,
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
              {progress.completed} / {progress.required} completions
            </DesignText>
          </View>
        ) : null}
        {state.status === 'ready' ? (
          <>
            {state.fromCache ? (
              <DesignText style={{ fontSize: 12, color: homeTokens.secondary }}>
                Saved progress. Updates may be pending.
              </DesignText>
            ) : null}
            {state.tasks.map((task) => (
              <View
                key={task.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  borderTopWidth: 1,
                  borderColor: homeTokens.border,
                  paddingTop: 12,
                }}
              >
                <DesignText
                  style={{ flex: 1, fontSize: 17, color: homeTokens.text }}
                >
                  {task.title}
                </DesignText>
                <DesignText
                  accessibilityLabel={`${task.title}: ${task.completedCount} of ${task.targetCount} completions recorded`}
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
              ? 'Progress unavailable'
              : 'Loading progress…'}
          </DesignText>
        )}
        <HomeCardAction
          label="Open agreement"
          accessibilityLabel={`Open Contract: ${contract.rewardTerms.title}`}
          onPress={onPress}
        />
      </HomeFeatureCard>
    );
  return (
    <HomeListRow
      reward={contract.rewardTerms}
      title={contract.rewardTerms.title}
      label={`Open Contract: ${childName ? `${childName} · ` : ''}${contract.rewardTerms.title}`}
      detail={`${childName ? `${childName} · ` : ''}${contractStatusLabel(contract.status, 'CHILD')} · Due ${new Date(contract.deadlineAt).toLocaleDateString()}${state.status === 'error' ? ' · Progress unavailable' : state.status === 'ready' && state.fromCache ? ' · Saved progress' : ''}`}
      progress={progress}
      onPress={onPress}
    />
  );
}
