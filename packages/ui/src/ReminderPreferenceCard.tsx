import { Switch } from 'react-native';
import { FormMessage } from './FormMessage';
import { DesignText, homeTokens } from './Home';
import { SettingsRow } from './Settings';
export function ReminderPreferenceCard(props: {
  label: string;
  description: string;
  enabled?: boolean;
  busy: boolean;
  fromCache?: boolean;
  error?: string;
  onChange: (enabled: boolean) => void;
}) {
  const loaded = props.enabled !== undefined;
  return (
    <SettingsRow
      last
      title={props.label}
      subtitle={props.description}
      icon="alarm-outline"
      tone="lavender"
      control={
        loaded ? (
          <Switch
            hitSlop={8}
            accessibilityLabel={props.label}
            accessibilityHint="Controls optional reminders for your account. Does not change device notification permission."
            accessibilityState={{
              disabled: props.busy,
              checked: props.enabled,
            }}
            disabled={props.busy}
            value={props.enabled}
            trackColor={{ true: homeTokens.success }}
            onValueChange={props.onChange}
          />
        ) : undefined
      }
    >
      <DesignText style={{ fontSize: 13, color: homeTokens.secondary }}>
        Optional reminders only. Device permission is separate; agreement
        updates stay enabled.
      </DesignText>
      {!loaded && !props.error ? (
        <DesignText style={{ fontSize: 14, color: homeTokens.secondary }}>
          Loading reminder setting…
        </DesignText>
      ) : null}
      {props.fromCache ? (
        <DesignText style={{ fontSize: 13, color: homeTokens.secondary }}>
          Showing saved settings. Connect to confirm changes.
        </DesignText>
      ) : null}
      {props.busy ? (
        <DesignText
          accessibilityLiveRegion="polite"
          style={{ fontSize: 14, color: homeTokens.secondary }}
        >
          Saving reminder setting…
        </DesignText>
      ) : null}
      <FormMessage message={props.error} />
    </SettingsRow>
  );
}
