import { t, useAppLanguage } from '@chorex/ui';
import { ParentFamilyProvider } from './FamilyContext';
import type { ReactNode } from 'react';
import { usePathname, useRouter } from 'expo-router';
import {
  NavigationFrame,
  amberAuroraPalette,
  type NavigationItem,
} from '@chorex/ui';
const items: readonly NavigationItem[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'contracts', label: 'Contracts', icon: 'checkbox' },
  { id: 'create', label: 'Create order', icon: 'add', prominent: true },
  { id: 'offers', label: 'Offers', icon: 'document-text' },
  { id: 'rewards', label: 'Rewards', icon: 'gift' },
];
const destinations = {
  home: '/',
  offers: '/offers',
  contracts: '/contracts',
  rewards: '/rewards',
  more: '/more',
  create: '/offers/create',
  review: '/contracts',
  family: '/family',
} as const;
export function AppNavigation({ children }: { children: ReactNode }) {
  useAppLanguage();
  const router = useRouter();
  const path = usePathname();
  const section = path.split('/')[1];
  const active = section === 'privacy' ? 'more' : section || 'home';
  return (
    <ParentFamilyProvider>
      <NavigationFrame
        showLabels={false}
        iconSize={32}
        accentColor={amberAuroraPalette.deepBlue}
        prominentColor={amberAuroraPalette.navigationInactive}
        items={items.map((item) => ({ ...item, label: t(item.label) }))}
        active={active}
        onNavigate={(id) => {
          const destination = destinations[id as keyof typeof destinations];
          if (destination) router.navigate(destination);
        }}
      >
        {children}
      </NavigationFrame>
    </ParentFamilyProvider>
  );
}
