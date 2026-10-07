import { Switch, Text, View } from 'react-native';
import { FormMessage } from './FormMessage';
import { useDynamicTypeStyles } from './typography';
export function ReminderPreferenceCard(props: {
  label: string;
  enabled?: boolean;
  busy: boolean;
  fromCache?: boolean;
  error?: string;
  onChange: (enabled: boolean) => void;
}) {
  const type = useDynamicTypeStyles();
  return (
    <View className="gap-3 rounded-3xl border border-border bg-surface-warm p-5">
      <Text
        accessibilityRole="header"
        allowFontScaling={false}
        className="font-bold text-text"
        style={type.title}
      >
        {props.label}
      </Text>
      <Switch
        accessibilityLabel={props.label}
        accessibilityState={{
          disabled: props.busy || props.enabled === undefined,
          checked: props.enabled,
        }}
        disabled={props.busy || props.enabled === undefined}
        value={props.enabled ?? false}
        onValueChange={props.onChange}
      />
      <Text
        allowFontScaling={false}
        className="text-text-muted"
        style={type.body}
      >
        This account setting controls optional reminders. Delivery also needs
        notification permission on your device.
      </Text>
      {props.enabled === undefined && !props.error ? (
        <Text style={type.body} className="text-text-muted">
          Loading reminder setting…
        </Text>
      ) : null}
      {props.fromCache ? (
        <Text style={type.body} className="text-text-muted">
          Showing saved settings. Connect to confirm changes.
        </Text>
      ) : null}
      {props.busy ? (
        <Text
          accessibilityLiveRegion="polite"
          style={type.body}
          className="text-text-muted"
        >
          Saving reminder setting…
        </Text>
      ) : null}
      <FormMessage message={props.error} />
    </View>
  );
}
