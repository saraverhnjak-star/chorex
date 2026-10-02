import { useId, useState } from 'react';
import {
  Pressable,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { amberAuroraColors } from './theme';
import { useDynamicTypeStyles } from './typography';

interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string;
  endActionLabel?: string;
  onEndActionPress?: () => void;
}

export function TextField({
  label,
  error,
  editable = true,
  endActionLabel,
  onEndActionPress,
  onBlur,
  onFocus,
  ...inputProps
}: TextFieldProps) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const dynamicType = useDynamicTypeStyles();

  return (
    <View>
      <Text
        allowFontScaling={false}
        nativeID={`${id}-label`}
        className="mb-2 font-semibold text-text"
        style={dynamicType.body}
      >
        {label}
      </Text>
      <View
        className={`flex-row items-center rounded-2xl border-2 bg-surface ${
          error ? 'border-danger' : focused ? 'border-focus' : 'border-border'
        } ${editable ? '' : 'opacity-50'}`}
      >
        <TextInput
          {...inputProps}
          allowFontScaling={false}
          accessibilityHint={error}
          accessibilityLabel={label}
          accessibilityState={{ disabled: !editable }}
          className="min-h-12 flex-1 px-4 py-3 text-text"
          editable={editable}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          placeholderTextColor={amberAuroraColors.textMuted}
          selectionColor={amberAuroraColors.focus}
          style={dynamicType.body}
        />
        {endActionLabel && onEndActionPress ? (
          <Pressable
            accessibilityLabel={`${endActionLabel} ${label.toLowerCase()}`}
            accessibilityRole="button"
            className="min-h-12 justify-center px-4 py-3"
            hitSlop={8}
            onPress={onEndActionPress}
          >
            <Text
              allowFontScaling={false}
              className="font-semibold text-text"
              style={dynamicType.body}
            >
              {endActionLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text
          allowFontScaling={false}
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          className="mt-2 self-start rounded-xl bg-surface px-2 py-1 font-medium text-danger"
          style={dynamicType.small}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}
