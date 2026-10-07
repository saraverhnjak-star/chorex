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
}: {
  title: string;
  description?: string;
  completedCount: number;
  targetCount: number;
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
      accessibilityLabel={`${title}. ${description ? `${description}. ` : ''}${completedCount} of ${targetCount}. ${progress}.`}
      style={{
        gap: 12,
        padding: homeTokens.spacing.card,
        borderWidth: 1,
        borderColor: homeTokens.border,
        borderRadius: homeTokens.radius.card,
        backgroundColor: homeTokens.surface,
      }}
    >
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
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
            size={20}
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
      <CompletionBar completed={completedCount} required={targetCount} />
    </View>
  );
}
