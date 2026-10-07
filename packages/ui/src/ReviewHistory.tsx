import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DesignText as Text, homeTokens } from './Home';
import type { ContractReview } from '@chorex/domain';
import { FormMessage } from './FormMessage';

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
  const styles = {
    body: { fontSize: 16, color: homeTokens.text },
    small: { fontSize: 14, color: homeTokens.secondary },
  };
  return (
    <View className="gap-3">
      <Text
        allowFontScaling={false}
        accessibilityRole="header"
        className="font-semibold text-home-text"
        style={styles.body}
      >
        Review history
      </Text>
      {loading ? (
        <Text
          allowFontScaling={false}
          accessibilityLiveRegion="polite"
          className="text-home-muted"
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
              className="text-home-muted"
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
                <View
                  key={review.id}
                  style={{
                    gap: 8,
                    borderLeftWidth: 2,
                    borderLeftColor:
                      review.decision === 'APPROVE'
                        ? homeTokens.success
                        : homeTokens.attentionText,
                    paddingLeft: 12,
                    paddingVertical: 8,
                  }}
                >
                  <Ionicons
                    accessible={false}
                    name={
                      review.decision === 'APPROVE'
                        ? 'checkmark-circle-outline'
                        : 'chatbox-outline'
                    }
                    size={20}
                    color={
                      review.decision === 'APPROVE'
                        ? homeTokens.success
                        : homeTokens.attentionText
                    }
                  />
                  <Text
                    allowFontScaling={false}
                    accessibilityRole="header"
                    accessibilityLabel={`Review ${review.cycle + 1}: ${decision}. ${date}`}
                    className="font-semibold text-home-text"
                    style={styles.body}
                  >
                    Review {review.cycle + 1}: {decision}
                  </Text>
                  <Text
                    allowFontScaling={false}
                    className="text-home-muted"
                    style={styles.small}
                  >
                    Parent · {date}
                  </Text>
                  {review.note ? (
                    <Text
                      allowFontScaling={false}
                      className="text-home-text"
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
              className="text-home-muted"
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
