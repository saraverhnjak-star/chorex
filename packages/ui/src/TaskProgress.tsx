import { Text, View } from 'react-native';
import { useDynamicTypeStyles } from './typography';

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
  const styles = useDynamicTypeStyles();
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
      className="gap-2 rounded-2xl border border-border bg-surface p-4"
    >
      <Text
        allowFontScaling={false}
        className="font-semibold text-text"
        style={styles.body}
      >
        {title}
      </Text>
      {description ? (
        <Text
          allowFontScaling={false}
          className="text-text-muted"
          style={styles.body}
        >
          {description}
        </Text>
      ) : null}
      <Text allowFontScaling={false} className="text-text" style={styles.body}>
        {completedCount} / {targetCount} · {progress}
      </Text>
    </View>
  );
}
