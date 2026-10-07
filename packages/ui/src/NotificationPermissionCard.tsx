import { Text, View } from 'react-native';
import { Button } from './Button';
import { FormMessage } from './FormMessage';
import { useDynamicTypeStyles } from './typography';

export interface NotificationPermissionCardProps {
  benefit: string;
  education: boolean;
  busy: boolean;
  registered: boolean;
  quiet?: boolean;
  error?: string;
  settingsRequired: boolean;
  onEnable: () => void;
  onSkip: () => void;
  onSettings: () => void;
}
export function NotificationPermissionCard(
  props: NotificationPermissionCardProps,
) {
  const type = useDynamicTypeStyles();
  return (
    <View className="gap-3 rounded-3xl border border-border bg-surface-warm p-5">
      <Text
        allowFontScaling={false}
        accessibilityRole="header"
        className="font-bold text-text"
        style={type.title}
      >
        Notifications
      </Text>
      {props.education ? (
        <>
          <Text
            allowFontScaling={false}
            className="text-text-muted"
            style={type.body}
          >
            {props.benefit}
          </Text>
          <Text
            allowFontScaling={false}
            className="text-text-muted"
            style={type.body}
          >
            Notifications are optional. You can keep using ChoreX without them.
          </Text>
          <Button
            label="Enable notifications"
            loading={props.busy}
            onPress={props.onEnable}
          />
          <Button
            label="Not now"
            disabled={props.busy}
            onPress={props.onSkip}
            variant="secondary"
          />
        </>
      ) : (
        <>
          <Text
            allowFontScaling={false}
            accessibilityLiveRegion="polite"
            className="text-text-muted"
            style={type.body}
          >
            {props.registered
              ? props.quiet
                ? 'Notifications are on quietly on this device.'
                : 'Notifications are enabled on this device.'
              : 'Notifications are off. You can keep using ChoreX normally.'}
          </Text>
          {props.settingsRequired ? (
            <>
              <Text
                allowFontScaling={false}
                className="text-text-muted"
                style={type.body}
              >
                Allow notifications in your system Settings, then return to
                ChoreX.
              </Text>
              <Button
                label="Open notification settings"
                disabled={props.busy}
                onPress={props.onSettings}
                variant="secondary"
              />
            </>
          ) : !props.registered ? (
            <Button
              label={
                props.error ? 'Retry notifications' : 'Enable notifications'
              }
              loading={props.busy}
              onPress={props.onEnable}
              variant="secondary"
            />
          ) : null}
        </>
      )}
      {props.error ? <FormMessage message={props.error} /> : null}
    </View>
  );
}
