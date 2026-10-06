import { Text, View } from 'react-native';
import type { ContractReview } from '@chorex/domain';
import { FormMessage } from './FormMessage';
import { useDynamicTypeStyles } from './typography';

export function ReviewHistory({
  reviews,
  loading,
  error,
  fromCache = false,
}: {
  reviews: readonly ContractReview[];
  loading: boolean;
  error: boolean;
  fromCache?: boolean;
}) {
  const styles = useDynamicTypeStyles();
  return (
    <View className="gap-3">
      <Text
        allowFontScaling={false}
        accessibilityRole="header"
        className="font-semibold text-text"
        style={styles.body}
      >
        Review history
      </Text>
      {loading ? (
        <Text
          allowFontScaling={false}
          accessibilityLiveRegion="polite"
          className="text-text-muted"
          style={styles.body}
        >
          Loading review history…
        </Text>
      ) : error ? (
        <FormMessage message="Review history could not be loaded. Reopen this Contract to try again." />
      ) : (
        <>
          {reviews.length === 0 ? (
            <Text
              allowFontScaling={false}
              accessibilityLiveRegion="polite"
              className="text-text-muted"
              style={styles.body}
            >
              {fromCache
                ? 'No saved reviews are available yet. Connect to the internet to load them.'
                : 'No reviews yet'}
            </Text>
          ) : (
            reviews.map((review) => {
              const decision =
                review.decision === 'APPROVE'
                  ? 'Approved'
                  : 'Changes requested';
              const date = new Date(review.createdAt).toLocaleString();
              return (
                <View key={review.id} className="gap-2">
                  <Text
                    allowFontScaling={false}
                    accessibilityRole="header"
                    accessibilityLabel={`Review ${review.cycle + 1}: ${decision}. ${date}`}
                    className="font-semibold text-text"
                    style={styles.body}
                  >
                    Review {review.cycle + 1}: {decision}
                  </Text>
                  <Text
                    allowFontScaling={false}
                    className="text-text-muted"
                    style={styles.small}
                  >
                    {date}
                  </Text>
                  {review.note ? (
                    <Text
                      allowFontScaling={false}
                      className="text-text"
                      style={styles.body}
                    >
                      {review.note}
                    </Text>
                  ) : null}
                </View>
              );
            })
          )}
          {fromCache && reviews.length > 0 ? (
            <Text
              allowFontScaling={false}
              accessibilityLiveRegion="polite"
              className="text-text-muted"
              style={styles.small}
            >
              Showing saved review history. Updates may be pending.
            </Text>
          ) : null}
        </>
      )}
    </View>
  );
}
