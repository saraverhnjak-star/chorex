import { ContractTabs } from '../src/contracts/ContractTabs';
import { fireEvent, render, screen } from '@testing-library/react-native';
jest.mock('../src/contracts/ActiveContracts', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    ActiveContracts: () => <Text>Active queue</Text>,
    ReadyForReviewContracts: () => <Text>Review queue</Text>,
  };
});
it('puts For review first, selects it initially, and switches queues without a counter', () => {
  render(<ContractTabs familyId="family" authUid="parent" childNames={{}} />);
  expect(
    screen.getAllByRole('tab').map((tab) => tab.props.accessibilityLabel),
  ).toEqual(['For review', 'Active']);
  expect(screen.getByRole('tab', { name: 'For review' })).toBeSelected();
  expect(screen.getByText('Review queue')).toBeOnTheScreen();
  expect(screen.queryByText('Active queue')).toBeNull();
  expect(
    screen.queryByTestId('review-tab-counter', { includeHiddenElements: true }),
  ).toBeNull();
  fireEvent.press(screen.getByRole('tab', { name: 'Active' }));
  expect(screen.getByText('Active queue')).toBeOnTheScreen();
  expect(screen.queryByText('Review queue')).toBeNull();
  fireEvent.press(screen.getByRole('tab', { name: 'For review' }));
  expect(screen.getByText('Review queue')).toBeOnTheScreen();
});
