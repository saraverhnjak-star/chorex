import { t, useAppLanguage } from './localization';
import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DesignText as Text, homeTokens } from './Home';
import { FormMessage } from './FormMessage';

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
  useAppLanguage();

  const styles = {
    body: { fontSize: 16, color: homeTokens.text },
    small: { fontSize: 14, color: homeTokens.secondary },
  };
  return (
    <View
      style={{
        gap: 12,
        padding: homeTokens.spacing.medium,
        borderRadius: 16,
        backgroundColor: homeTokens.attention,
      }}
    >
      <Ionicons
        accessible={false}
        name="chatbox-ellipses-outline"
        size={24}
        color={homeTokens.attentionText}
      />
      <Text
        allowFontScaling={false}
        accessibilityLiveRegion="polite"
        className="text-home-text"
        style={styles.body}
      >
        {t('Changes were requested. The reward has not been earned.')}
      </Text>
      <Text
        allowFontScaling={false}
        accessibilityRole="header"
        className="font-semibold text-home-text"
        style={styles.body}
      >
        {t('Parent feedback')}
      </Text>
      {loading ? (
        <Text
          allowFontScaling={false}
          accessibilityLiveRegion="polite"
          className="text-home-muted"
          style={styles.body}
        >
          {t('Loading feedback…')}
        </Text>
      ) : error ? (
        <FormMessage
          message={t(
            'Feedback could not be loaded. Reopen this Contract to try again.',
          )}
        />
      ) : note ? (
        <>
          <Text
            allowFontScaling={false}
            className="text-home-text"
            style={styles.body}
          >
            {note}
          </Text>
          {fromCache ? (
            <Text
              allowFontScaling={false}
              className="text-home-muted"
              style={styles.small}
            >
              {t('Showing saved feedback. Updates may be pending.')}
            </Text>
          ) : null}
        </>
      ) : (
        <Text
          allowFontScaling={false}
          className="text-home-muted"
          style={styles.body}
        >
          {fromCache
            ? t(
                'No saved feedback is available yet. Connect to the internet to load it.',
              )
            : t('Feedback is not available yet.')}
        </Text>
      )}
    </View>
  );
}
