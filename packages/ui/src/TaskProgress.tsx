import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DesignText, homeTokens } from './Home';
import { CompletionBar } from './ContractPresentation';
/** Presentation only: counts come from the authoritative ContractTask projection. */
export function TaskProgress({
  title,
  description,
  completedCount,
  targetCount,
  compact = false,
}: {
  title: string;
  description?: string;
  completedCount: number;
  targetCount: number;
  compact?: boolean;
}) {
  const progress =
    completedCount === targetCount
      ? 'Complete'
      : completedCount === 0
        ? 'Not started'
        : 'In progress';
  return (
    <View
      accessible
      accessibilityLabel={`${title}. ${description ? `${description}. ` : ''}${completedCount} of ${targetCount} completions recorded. ${progress}.`}
      style={{
        gap: 12,
        padding: compact ? homeTokens.spacing.medium : homeTokens.spacing.card,
        borderWidth: compact ? 0 : 1,
        borderColor: homeTokens.border,
        borderRadius: homeTokens.radius.card,
        backgroundColor: compact ? undefined : homeTokens.surface,
      }}
    >
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
        <View
          style={{
            width: compact ? 44 : 32,
            height: compact ? 44 : 32,
            borderRadius: compact ? 22 : 16,
            backgroundColor:
              progress === 'Complete' ? homeTokens.mint : homeTokens.blue,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons
            accessible={false}
            name={
              progress === 'Complete' ? 'checkmark-outline' : 'checkbox-outline'
            }
            size={compact ? 26 : 20}
            color={
              progress === 'Complete'
                ? homeTokens.success
                : homeTokens.secondary
            }
          />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <DesignText
            style={{ fontSize: 16, fontWeight: '600', color: homeTokens.text }}
          >
            {title}
          </DesignText>
          {description ? (
            <DesignText style={{ fontSize: 14, color: homeTokens.secondary }}>
              {description}
            </DesignText>
          ) : null}
          <DesignText style={{ fontSize: 14, color: homeTokens.secondary }}>
            {completedCount} / {targetCount} · {progress}
          </DesignText>
        </View>
      </View>
      <CompletionBar
        completed={completedCount}
        required={targetCount}
        decorative
      />
    </View>
  );
}
