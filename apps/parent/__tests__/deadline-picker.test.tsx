import { render, screen, fireEvent } from '@testing-library/react-native';
import { DeadlinePicker } from '../src/offers/DeadlinePicker';

it('keeps the deadline unchanged when the native date selection is cancelled', () => {
  const onChange = jest.fn();
  render(<DeadlinePicker date="2099-10-10" time="09:15" onChange={onChange} />);
  fireEvent.press(
    screen.getByRole('button', { name: /Choose deadline date:/ }),
  );
  fireEvent(
    screen.getByLabelText('Deadline date'),
    'onChange',
    { type: 'set' },
    new Date(2099, 9, 11),
  );
  fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  expect(onChange).not.toHaveBeenCalled();
});
it('changes the selected local date while preserving the agreed time', () => {
  const onChange = jest.fn();
  render(<DeadlinePicker date="2099-10-10" time="09:15" onChange={onChange} />);
  fireEvent.press(
    screen.getByRole('button', { name: /Choose deadline date:/ }),
  );
  fireEvent(
    screen.getByLabelText('Deadline date'),
    'onChange',
    { type: 'set' },
    new Date(2099, 9, 11, 0, 0),
  );
  fireEvent.press(screen.getByRole('button', { name: 'Done' }));
  expect(onChange).toHaveBeenCalledWith({ date: '2099-10-11', time: '09:15' });
});
