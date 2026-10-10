import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Platform } from 'react-native';
import {
  CompletionBar,
  FormMessage,
  HomeListRow,
  NavigationFrame,
  ReminderPreferenceCard,
  RewardIconPicker,
  TextField,
} from '@chorex/ui';

beforeEach(() => jest.clearAllMocks());
afterEach(() => jest.restoreAllMocks());

it('exposes selected tabs and a coherent card name without nested progress stops', () => {
  render(
    <NavigationFrame
      items={[
        { id: 'home', label: 'Home', icon: 'home-outline' },
        { id: 'rewards', label: 'Rewards', icon: 'gift-outline' },
      ]}
      active="rewards"
      onNavigate={jest.fn()}
    >
      <HomeListRow
        title="Cinema"
        detail="Mia · Due tomorrow"
        label="Open agreement: Cinema"
        progress={{ completed: 3, required: 5 }}
        onPress={jest.fn()}
      />
    </NavigationFrame>,
  );
  expect(screen.getByRole('tab', { name: 'Rewards' })).toHaveProp(
    'accessibilityState',
    expect.objectContaining({ selected: true }),
  );
  expect(screen.getByRole('tab', { name: 'Home' })).toHaveProp(
    'accessibilityState',
    {
      selected: false,
    },
  );
  expect(
    screen.getByRole('button', {
      name: /Cinema.*Mia.*3 of 5 completions recorded/,
    }),
  ).toBeOnTheScreen();
  expect(screen.queryByRole('progressbar')).toBeNull();
});

it('announces count-based progress and the account reminder switch state', () => {
  render(
    <>
      <CompletionBar completed={2} required={10} />
      <ReminderPreferenceCard
        label="Deadline reminders"
        description="Optional reminders"
        enabled={false}
        busy={false}
        onChange={jest.fn()}
      />
    </>,
  );
  expect(screen.getByRole('progressbar')).toHaveAccessibilityValue({
    min: 0,
    max: 10,
    now: 2,
    text: '2 of 10 completions recorded',
  });
  expect(screen.getByRole('switch', { name: 'Deadline reminders' })).toHaveProp(
    'accessibilityState',
    { checked: false, disabled: false },
  );
});

it('associates required fields and errors; locks password visibility with a disabled field', () => {
  render(
    <TextField
      label="Password"
      error="Enter a password"
      editable={false}
      endActionLabel="Show"
      onEndActionPress={jest.fn()}
    />,
  );
  expect(screen.getByLabelText('Password')).toHaveProp(
    'accessibilityHint',
    'Required. Enter a password',
  );
  expect(screen.getByRole('button', { name: 'Show password' })).toBeDisabled();
  expect(screen.getByRole('alert')).toHaveTextContent('Enter a password');
});

it('preserves readable picker names, selected state and returns the chosen icon', async () => {
  const change = jest.fn();
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(true);
  render(<RewardIconPicker value="cinema" onChange={change} />);
  await act(async () => {});
  fireEvent.press(screen.getByRole('button', { name: 'Change icon' }));
  expect(screen.getByRole('button', { name: 'Choose Cinema icon' })).toHaveProp(
    'accessibilityState',
    expect.objectContaining({ selected: true }),
  );
  const book = screen.getByRole('button', { name: 'Choose Book icon' });
  expect(book).toHaveProp(
    'accessibilityState',
    expect.objectContaining({ selected: false }),
  );
  fireEvent.press(book);
  expect(change).toHaveBeenCalledWith('book');
  expect(
    screen.queryByRole('button', { name: 'Choose Cinema icon' }),
  ).toBeNull();
});

it('announces a new iOS submission error once, without repeating unchanged messages', () => {
  const platform = jest.replaceProperty(Platform, 'OS', 'ios');
  const announce = jest
    .spyOn(AccessibilityInfo, 'announceForAccessibility')
    .mockImplementation(() => {});
  const { rerender } = render(<FormMessage />);
  rerender(<FormMessage message="Check your connection" />);
  rerender(<FormMessage message="Check your connection" />);
  expect(announce).toHaveBeenCalledTimes(1);
  expect(announce).toHaveBeenCalledWith('Check your connection');
  announce.mockRestore();
  platform.restore();
});

it('navigates immediately without an overlay', () => {
  const navigate = jest.fn();
  render(
    <NavigationFrame
      items={[{ id: 'rewards', label: 'Rewards', icon: 'gift-outline' }]}
      active="home"
      onNavigate={navigate}
    >
      <HomeListRow
        title="Cinema"
        detail="Reward"
        label="Cinema"
        onPress={jest.fn()}
      />
    </NavigationFrame>,
  );
  fireEvent.press(screen.getByRole('tab', { name: 'Rewards' }));
  expect(navigate).toHaveBeenCalledWith('rewards');
  expect(screen.queryByTestId('navigation-loader')).toBeNull();
});
