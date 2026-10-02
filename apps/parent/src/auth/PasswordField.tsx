import { useState, type ComponentProps } from 'react';
import { TextField } from '@chorex/ui';

type PasswordFieldProps = Omit<
  ComponentProps<typeof TextField>,
  'endActionLabel' | 'onEndActionPress' | 'secureTextEntry'
>;

export function PasswordField(props: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <TextField
      {...props}
      endActionLabel={visible ? 'Hide' : 'Show'}
      onEndActionPress={() => setVisible((current) => !current)}
      secureTextEntry={!visible}
    />
  );
}
