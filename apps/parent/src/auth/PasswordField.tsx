import { t, useAppLanguage, TextField } from '@chorex/ui';
import { useState, type ComponentProps } from 'react';

type PasswordFieldProps = Omit<
  ComponentProps<typeof TextField>,
  'endActionLabel' | 'onEndActionPress' | 'secureTextEntry'
>;

export function PasswordField(props: PasswordFieldProps) {
  useAppLanguage();

  const [visible, setVisible] = useState(false);

  return (
    <TextField
      {...props}
      endActionLabel={visible ? t('Hide') : t('Show')}
      onEndActionPress={() => setVisible((current) => !current)}
      secureTextEntry={!visible}
    />
  );
}
