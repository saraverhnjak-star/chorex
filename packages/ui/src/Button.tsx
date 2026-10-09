import { homeTokens, useHomeTheme } from './Home';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, type View } from 'react-native';
import { amberAuroraColors } from './theme';
import { useDynamicTypeStyles } from './typography';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger';

interface ButtonProps {
  label: string;
  ref?: React.Ref<View>;
  accessibilityLabel?: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: ButtonVariant;
}

const containerClasses: Record<ButtonVariant, string> = {
  primary: 'bg-primary',
  secondary: 'bg-secondary',
  outline: 'bg-home-surface',
  danger: 'bg-home-surface',
};

export function Button({
  label,
  ref,
  accessibilityLabel = label,
  onPress,
  disabled = false,
  loading = false,
  variant = 'primary',
}: ButtonProps) {
  const home = useHomeTheme();
  const [focused, setFocused] = useState(false);
  const dynamicType = useDynamicTypeStyles();
  const unavailable = disabled || loading;

  return (
    <Pressable
      ref={ref}
      accessible
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: unavailable }}
      className={`active:opacity-80 min-h-12 items-center justify-center rounded-2xl border-2 px-5 py-3 ${
        containerClasses[variant]
      } ${focused ? 'border-focus' : variant === 'danger' ? 'border-danger' : variant === 'outline' ? 'border-home-border' : 'border-transparent'} ${
        unavailable ? 'opacity-50' : ''
      }`}
      disabled={unavailable}
      onBlur={() => setFocused(false)}
      onFocus={() => setFocused(true)}
      onPress={onPress}
      style={
        home
          ? {
              backgroundColor:
                variant === 'primary'
                  ? homeTokens.coral
                  : variant === 'secondary'
                    ? homeTokens.blue
                    : homeTokens.surface,
            }
          : undefined
      }
    >
      {loading ? (
        <ActivityIndicator color={amberAuroraColors.text} />
      ) : (
        <Text
          allowFontScaling={false}
          className="text-center font-semibold text-text"
          style={[
            dynamicType.body,
            variant === 'danger'
              ? { color: amberAuroraColors.danger }
              : home
                ? {
                    color: homeTokens.text,
                    lineHeight: Number(dynamicType.body.fontSize) * 1.35,
                  }
                : undefined,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}
