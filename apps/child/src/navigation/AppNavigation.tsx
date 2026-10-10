import { ChildFamilyProvider } from './FamilyContext';
import type { ReactNode } from 'react';
import { usePathname, useRouter } from 'expo-router';
import { NavigationFrame, type NavigationItem } from '@chorex/ui';
const items: readonly NavigationItem[] = [
  { id: 'home', label: 'Home', icon: 'home-outline' },
  { id: 'contracts', label: 'My chores', icon: 'checkbox-outline' },
  { id: 'offers', label: 'Offers', icon: 'document-text-outline' },
  { id: 'rewards', label: 'Rewards', icon: 'gift-outline' },
];
const destinations = {
  home: '/',
  offers: '/offers',
  contracts: '/contracts',
  rewards: '/rewards',
  more: '/more',
} as const;
export function AppNavigation({ children }: { children: ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const section = path.split('/')[1];
  const active = section === 'family' ? 'more' : section || 'home';
  return (
    <ChildFamilyProvider>
      <NavigationFrame
        items={items}
        active={active}
        onNavigate={(id) => {
          const destination = destinations[id as keyof typeof destinations];
          if (destination) router.navigate(destination);
        }}
      >
        {children}
      </NavigationFrame>
    </ChildFamilyProvider>
  );
}
