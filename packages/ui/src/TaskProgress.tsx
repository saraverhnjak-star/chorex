import { t, useAppLanguage } from './localization';
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
  useAppLanguage();

  const progress =
    completedCount === targetCount
      ? t('Complete')
      : completedCount === 0
        ? t('Not started')
        : t('In progress');
  return (
    <View
      accessible
      accessibilityLabel={t('{0}. {1}{2} of {3} completions recorded. {4}.', {
        '0': title,
        '1': description ? `${description}. ` : '',
        '2': completedCount,
        '3': targetCount,
        '4': progress,
      })}
      style={{
        gap: 12,
        padding: compact ? 0 : homeTokens.spacing.card,
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
              completedCount === targetCount
                ? homeTokens.mint
                : homeTokens.blue,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons
            accessible={false}
            name={
              completedCount === targetCount
                ? 'checkmark-outline'
                : 'checkbox-outline'
            }
            size={compact ? 26 : 20}
            color={
              completedCount === targetCount
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
