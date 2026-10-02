import { useState } from 'react';
import { ActivityIndicator, Pressable, Text } from 'react-native';
import { amberAuroraColors } from './theme';
import { useDynamicTypeStyles } from './typography';

type ButtonVariant = 'primary' | 'secondary';

interface ButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: ButtonVariant;
}

const containerClasses: Record<ButtonVariant, string> = {
  primary: 'bg-primary',
  secondary: 'bg-secondary',
};

export function Button({
  label,
  onPress,
  disabled = false,
  loading = false,
  variant = 'primary',
}: ButtonProps) {
  const [focused, setFocused] = useState(false);
  const dynamicType = useDynamicTypeStyles();
  const unavailable = disabled || loading;

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: unavailable }}
      className={`min-h-12 items-center justify-center rounded-2xl border-2 px-5 py-3 ${
        containerClasses[variant]
      } ${focused ? 'border-focus' : 'border-transparent'} ${
        unavailable ? 'opacity-50' : ''
      }`}
      disabled={unavailable}
      onBlur={() => setFocused(false)}
      onFocus={() => setFocused(true)}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed && !unavailable ? 0.8 : 1 })}
    >
      {loading ? (
        <ActivityIndicator color={amberAuroraColors.text} />
      ) : (
        <Text
          allowFontScaling={false}
          className="text-center font-semibold text-text"
          style={dynamicType.body}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}
