import { View } from 'react-native';
import { Button } from './Button';
import { FormMessage } from './FormMessage';
import { DesignText, homeTokens } from './Home';
import { SettingsRow } from './Settings';

export interface NotificationPermissionCardProps {
  benefit: string;
  education: boolean;
  busy: boolean;
  registered: boolean;
  permissionGranted?: boolean;
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
  const title = props.busy
    ? 'Checking notifications…'
    : props.registered
      ? 'Notifications on'
      : props.error && props.permissionGranted !== false
        ? 'Notifications unavailable'
        : 'Notifications off';
  const subtitle = props.busy
    ? 'Checking permission and connection on this device.'
    : props.registered
      ? props.quiet
        ? 'ChoreX can send quiet notifications to this device.'
        : 'ChoreX can send notifications to this device.'
      : props.settingsRequired
        ? 'Notifications are disabled in system settings.'
        : props.permissionGranted
          ? 'Permission is allowed, but notification setup is not complete.'
          : props.error && props.permissionGranted === undefined
            ? 'Notification status could not be checked. Try again.'
            : 'Notifications are currently disabled on this device.';
  return (
    <SettingsRow
      title={title}
      subtitle={subtitle}
      icon={
        props.registered && !props.busy
          ? 'notifications-outline'
          : 'notifications-off-outline'
      }
      tone={props.registered && !props.busy ? 'mint' : 'blue'}
    >
      {props.education && !props.settingsRequired ? (
        <View style={{ gap: homeTokens.spacing.medium }}>
          <DesignText style={{ fontSize: 14, color: homeTokens.secondary }}>
            {props.benefit}
          </DesignText>
          <DesignText style={{ fontSize: 14, color: homeTokens.secondary }}>
            Notifications are optional. You can keep using ChoreX without them.
          </DesignText>
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
        </View>
      ) : props.settingsRequired ? (
        <View style={{ gap: homeTokens.spacing.medium }}>
          <DesignText style={{ fontSize: 14, color: homeTokens.secondary }}>
            Allow notifications in your system Settings, then return to ChoreX.
          </DesignText>
          <Button
            label="Open notification settings"
            disabled={props.busy}
            onPress={props.onSettings}
            variant="secondary"
          />
        </View>
      ) : !props.registered && !props.busy ? (
        <Button
          label={props.error ? 'Retry notifications' : 'Enable notifications'}
          onPress={props.onEnable}
          variant="secondary"
        />
      ) : null}
      {props.error ? <FormMessage message={props.error} /> : null}
    </SettingsRow>
  );
}
