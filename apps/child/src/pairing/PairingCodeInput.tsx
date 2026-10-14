import { useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { DesignText, amberAuroraPalette, homeTokens, t } from '@chorex/ui';

export function PairingCodeInput({
  digits,
  onChange,
  disabled,
}: {
  digits: readonly string[];
  onChange: (digits: string[]) => void;
  disabled: boolean;
}) {
  const inputs = useRef<(TextInput | null)[]>([]);
  const [focused, setFocused] = useState<number>();
  const change = (index: number, text: string) => {
    const numbers = text.replace(/\D/g, '').slice(0, 6);
    if (text && !numbers) return;
    const next = [...digits];
    if (!numbers) {
      next[index] = '';
      onChange(next);
      if (index > 0) inputs.current[index - 1]?.focus();
      return;
    }
    const start = numbers.length === 6 ? 0 : index;
    for (
      let offset = 0;
      offset < numbers.length && start + offset < 6;
      offset++
    )
      next[start + offset] = numbers[offset];
    onChange(next);
    inputs.current[Math.min(start + numbers.length, 5)]?.focus();
  };
  return (
    <View style={{ gap: homeTokens.spacing.small }}>
      <DesignText>{t('Pairing code')}</DesignText>
      <View style={{ flexDirection: 'row', gap: homeTokens.spacing.small }}>
        {digits.map((digit, index) => (
          <TextInput
            key={index}
            ref={(input) => {
              inputs.current[index] = input;
            }}
            accessibilityLabel={t('Pairing code digit {0} of 6', {
              '0': index + 1,
            })}
            accessibilityState={{ disabled }}
            value={digit}
            editable={!disabled}
            keyboardType="number-pad"
            autoCorrect={false}
            autoCapitalize="none"
            textContentType={index === 0 ? 'oneTimeCode' : 'none'}
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            selectTextOnFocus
            maxLength={7}
            onFocus={() => setFocused(index)}
            onBlur={() => setFocused(undefined)}
            onChangeText={(text) => change(index, text)}
            onKeyPress={({ nativeEvent }) => {
              if (nativeEvent.key === 'Backspace' && !digit && index > 0) {
                const next = [...digits];
                next[index - 1] = '';
                onChange(next);
                inputs.current[index - 1]?.focus();
              }
            }}
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 56,
              paddingVertical: homeTokens.spacing.medium,
              borderRadius: homeTokens.radius.card,
              borderWidth: 2,
              borderColor:
                focused === index
                  ? amberAuroraPalette.auroraBlue
                  : homeTokens.border,
              backgroundColor: homeTokens.surface,
              color: homeTokens.text,
              fontSize: 24,
              fontWeight: '600',
              textAlign: 'center',
              opacity: disabled ? 0.5 : 1,
            }}
          />
        ))}
      </View>
    </View>
  );
}
