import { render, screen } from '@testing-library/react-native';
import HomeScreen from '../app/index';

it('renders the parent screen through the public shared UI package', () => {
  render(<HomeScreen />);
  expect(
    screen.getByRole('header', { name: 'ChoreX Parent' }),
  ).toBeOnTheScreen();
});
