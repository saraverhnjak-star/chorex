import { Text, View } from 'react-native';
import { FormMessage } from './FormMessage';
import { useDynamicTypeStyles } from './typography';
export function ReviewFeedback({
  note,
  loading,
  error,
  fromCache = false,
}: {
  note?: string;
  loading: boolean;
  error: boolean;
  fromCache?: boolean;
}) {
  const styles = useDynamicTypeStyles();
  return (
    <View className="gap-2">
      <Text
        allowFontScaling={false}
        accessibilityLiveRegion="polite"
        className="text-text"
        style={styles.body}
      >
        Changes were requested. The reward has not been earned.
      </Text>
      <Text
        allowFontScaling={false}
        accessibilityRole="header"
        className="font-semibold text-text"
        style={styles.body}
      >
        Parent feedback
      </Text>
      {loading ? (
        <Text
          allowFontScaling={false}
          accessibilityLiveRegion="polite"
          className="text-text-muted"
          style={styles.body}
        >
          Loading feedback…
        </Text>
      ) : error ? (
        <FormMessage message="Feedback could not be loaded. Reopen this Contract to try again." />
      ) : note ? (
        <>
          <Text
            allowFontScaling={false}
            className="text-text"
            style={styles.body}
          >
            {note}
          </Text>
          {fromCache ? (
            <Text
              allowFontScaling={false}
              className="text-text-muted"
              style={styles.small}
            >
              Showing saved feedback. Updates may be pending.
            </Text>
          ) : null}
        </>
      ) : (
        <Text
          allowFontScaling={false}
          className="text-text-muted"
          style={styles.body}
        >
          {fromCache
            ? 'No saved feedback is available yet. Connect to the internet to load it.'
            : 'Feedback is not available yet.'}
        </Text>
      )}
    </View>
  );
}
