import {
  t,
  useAppLanguage,
  HomeScreenFrame,
  HomeHeader,
  DesignText,
  homeTokens,
} from '@chorex/ui';
import { SentOffers } from '../../../src/offers/SentOffers';
import { Pressable } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useParentSession } from '../../../src/auth/session';
import { useParentFamily } from '../../../src/navigation/FamilyContext';
import { ParentNegotiationInbox } from '../../../src/offers/ParentNegotiationInbox';

export default function OfferScreen() {
  useAppLanguage();

  const { offerId, sent } = useLocalSearchParams<{
    offerId: string | string[];
    sent?: string;
  }>();
  const session = useParentSession();
  const router = useRouter();
  const family = useParentFamily();
  const home = family?.state.status === 'ready' ? family.state.home : undefined;
  if (!session.user) return <Redirect href="/" />;
  const id = typeof offerId === 'string' ? offerId : '';
  return (
    <HomeScreenFrame
      fill
      keyboard
      header={
        <HomeHeader
          compact
          name={home?.profile.displayName ?? t('Parent')}
          leading={
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={t('Back to Offers')}
              onPress={() =>
                router.canGoBack() ? router.back() : router.replace('/offers')
              }
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <DesignText style={{ fontSize: 14, color: homeTokens.coralText }}>
                {t('← Offers')}
              </DesignText>
            </Pressable>
          }
        />
      }
    >
      {home && sent === 'true' ? (
        <SentOffers
          key={`${session.user.uid}:${id}`}
          offerId={id}
          familyId={home.family.id}
          childNames={Object.fromEntries(
            home.children.map((child) => [child.uid, child.displayName]),
          )}
        />
      ) : home ? (
        <ParentNegotiationInbox
          key={`${session.user.uid}:${id}`}
          offerId={id}
          familyId={home.family.id}
          authUid={session.user.uid}
          activeChildren={home.children}
        />
      ) : null}
    </HomeScreenFrame>
  );
}
