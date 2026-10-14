import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { PairingEntry } from '../src/pairing/PairingEntry';
import { TextInput, View as MockView } from 'react-native';
jest.mock('../src/pairing/messages', () => ({
  getPairingErrorMessage: () => 'Pairing could not be completed.',
}));
const mockPermission = jest.fn();
let mockGranted = false;
jest.mock('expo-camera', () => ({
  CameraView: (props: object) => (
    <MockView testID="pairing-camera" {...props} />
  ),
  useCameraPermissions: () => [
    { granted: mockGranted, canAskAgain: true },
    mockPermission,
  ],
}));
beforeEach(() => {
  mockGranted = false;
  mockPermission
    .mockReset()
    .mockResolvedValue({ granted: false, canAskAgain: true });
});
it('requests the camera only on explicit scan and retains manual fallback on denial', async () => {
  const pair = jest.fn();
  render(<PairingEntry pair={pair} />);
  expect(mockPermission).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Scan QR code' }));
  expect(
    await screen.findByLabelText('Pairing code digit 1 of 6'),
  ).toBeTruthy();
  fireEvent.changeText(
    screen.getByLabelText('Pairing code digit 1 of 6'),
    '048 273',
  );
  expect(screen.getByLabelText('Pairing code digit 1 of 6').props.value).toBe(
    '0',
  );
  fireEvent.press(screen.getByRole('button', { name: 'Connect' }));
  await waitFor(() =>
    expect(pair).toHaveBeenCalledWith('048273', expect.any(String)),
  );
});
it('accepts only opaque QR tokens and blocks repeated scan callbacks while pending', async () => {
  mockGranted = true;
  let finish: () => void = () => undefined;
  const pair = jest.fn().mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  render(<PairingEntry pair={pair} />);
  fireEvent.press(screen.getByRole('button', { name: 'Scan QR code' }));
  const camera = await screen.findByTestId('pairing-camera');
  fireEvent(camera, 'barcodeScanned', { data: 'https://example.com/child' });
  expect(pair).not.toHaveBeenCalled();
  const callback = camera.props.onBarcodeScanned;
  act(() => {
    callback({ data: 'AbCdEfGhIjKlMnOpQrStUw' });
    callback({ data: 'AbCdEfGhIjKlMnOpQrStUw' });
  });
  expect(pair).toHaveBeenCalledTimes(1);
  await act(async () => finish());
});
it('advances digit focus, moves back on deletion, and replaces a pasted code', async () => {
  const pair = jest.fn();
  const focus = (TextInput as unknown as { prototype: { focus: jest.Mock } })
    .prototype.focus;
  focus.mockClear();
  const focusedLabel = () =>
    focus.mock.contexts.at(-1)?.props.accessibilityLabel;
  render(<PairingEntry pair={pair} />);
  fireEvent.press(screen.getByRole('button', { name: 'Enter code manually' }));
  const input = (index: number) =>
    screen.getByLabelText(`Pairing code digit ${index + 1} of 6`);
  fireEvent.changeText(input(0), '0');
  expect(focusedLabel()).toBe('Pairing code digit 2 of 6');
  fireEvent.changeText(input(1), '4');
  expect(focusedLabel()).toBe('Pairing code digit 3 of 6');
  fireEvent(input(2), 'keyPress', { nativeEvent: { key: 'Backspace' } });
  expect(input(1).props.value).toBe('');
  expect(focusedLabel()).toBe('Pairing code digit 2 of 6');
  fireEvent.changeText(input(3), '048 273');
  expect(
    Array.from({ length: 6 }, (_, index) => input(index).props.value),
  ).toEqual(['0', '4', '8', '2', '7', '3']);
  fireEvent.changeText(input(5), '');
  expect(focusedLabel()).toBe('Pairing code digit 5 of 6');
  fireEvent.press(screen.getByRole('button', { name: 'Connect' }));
  expect(pair).not.toHaveBeenCalled();
  fireEvent.changeText(input(5), '3');
  fireEvent.press(screen.getByRole('button', { name: 'Connect' }));
  await waitFor(() =>
    expect(pair).toHaveBeenCalledWith('048273', expect.any(String)),
  );
});
