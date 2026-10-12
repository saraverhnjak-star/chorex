import { t, useAppLanguage } from '@chorex/ui';
import { ChildFamilyProvider } from './FamilyContext';
import type { ReactNode } from 'react';
import { usePathname, useRouter } from 'expo-router';
import { NavigationFrame, type NavigationItem } from '@chorex/ui';
const items: readonly NavigationItem[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'contracts', label: 'My chores', icon: 'checkbox' },
  { id: 'offers', label: 'Offers', icon: 'document-text' },
  { id: 'rewards', label: 'Rewards', icon: 'gift' },
];
const destinations = {
  home: '/',
  offers: '/offers',
  contracts: '/contracts',
  rewards: '/rewards',
  more: '/more',
} as const;
export function AppNavigation({ children }: { children: ReactNode }) {
  useAppLanguage();
  const router = useRouter();
  const path = usePathname();
  const section = path.split('/')[1];
  const active = section === 'family' ? 'more' : section || 'home';
  return (
    <ChildFamilyProvider>
      <NavigationFrame
        showLabels={false}
        iconSize={32}
        items={items.map((item) => ({ ...item, label: t(item.label) }))}
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
