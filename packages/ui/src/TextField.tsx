import { homeTokens, useHomeTheme } from './Home';
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
  const home = useHomeTheme();
  const id = useId();
  const [focused, setFocused] = useState(false);
  const dynamicType = useDynamicTypeStyles();

  return (
    <View>
      <Text
        allowFontScaling={false}
        nativeID={`${id}-label`}
        className="mb-2 font-semibold text-text"
        style={[
          dynamicType.body,
          home
            ? {
                color: homeTokens.text,
                lineHeight: Number(dynamicType.body.fontSize) * 1.35,
              }
            : undefined,
        ]}
      >
        {label}
      </Text>
      <View
        style={
          home
            ? {
                backgroundColor: homeTokens.surface,
                borderColor: error
                  ? amberAuroraColors.danger
                  : focused
                    ? homeTokens.coral
                    : homeTokens.border,
              }
            : undefined
        }
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
          placeholderTextColor={
            home ? homeTokens.secondary : amberAuroraColors.textMuted
          }
          selectionColor={home ? homeTokens.coral : amberAuroraColors.focus}
          style={[
            dynamicType.body,
            home
              ? {
                  color: homeTokens.text,
                  lineHeight: Number(dynamicType.body.fontSize) * 1.35,
                }
              : undefined,
          ]}
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
              style={[
                dynamicType.body,
                home
                  ? {
                      color: homeTokens.text,
                      lineHeight: Number(dynamicType.body.fontSize) * 1.35,
                    }
                  : undefined,
              ]}
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
