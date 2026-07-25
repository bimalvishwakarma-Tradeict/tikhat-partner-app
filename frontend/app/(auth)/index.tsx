import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter, type Href } from 'expo-router';
import {
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { lightColors } from '../../theme';
import { useTheme } from '../../hooks/useTheme';
import { Button } from '../../components/ui/Button';
import Logo from '@/assets/logo.png';

const LOGIN_HREF = '/(auth)/login' as Href;
const REGISTER_HREF = '/(auth)/register' as Href;
const TERMS_HREF = '/(auth)/terms' as Href;
const PRIVACY_HREF = '/(auth)/privacy' as Href;

const ACCENT = lightColors.secondary;
const DARK = lightColors.primary;
const WHITE = lightColors.background;
const GREY = lightColors.surface;
const TEXT_MUTED = lightColors.text.secondary;
const BORDER = lightColors.border;

type SectionKey =
  | 'features'
  | 'how'
  | 'contact'
  | 'portfolio'
  | 'business'
  | 'products'
  | 'dashboard'
  | 'why'
  | 'transparency'
  | 'cta'
  | 'risk';

const PORTFOLIO_CARDS = [
  {
    icon: 'wallet-outline' as const,
    title: 'Total Investment',
    body: 'Your active capital invested with Tikhat Foods.',
  },
  {
    icon: 'trending-up-outline' as const,
    title: 'Returns Earned',
    body: 'Track returns credited from your investments.',
  },
  {
    icon: 'cash-outline' as const,
    title: 'Available Balance',
    body: 'Funds currently available for withdrawal or reinvestment.',
  },
  {
    icon: 'layers-outline' as const,
    title: 'Active Investments',
    body: 'View all your currently active investment plans.',
  },
] as const;

const BUSINESS_FLOW = [
  'Raw Materials',
  'Manufacturing',
  'Packaging',
  'Distribution',
  'Sales',
  'Revenue',
] as const;

const HOW_STEPS = [
  {
    step: '01',
    title: 'Add Funds',
    body: 'Deposit funds securely through supported banking or UPI payment methods.',
  },
  {
    step: '02',
    title: 'Choose an Opportunity',
    body: 'Explore available investment opportunities and review their terms.',
  },
  {
    step: '03',
    title: 'Invest',
    body: 'Select the amount you want to invest and activate your investment.',
  },
  {
    step: '04',
    title: 'Track Performance',
    body: 'Follow your investment performance with daily and weekly updates.',
  },
  {
    step: '05',
    title: 'Receive Returns',
    body: 'Returns are credited according to the terms of your investment.',
  },
  {
    step: '06',
    title: 'Withdraw or Reinvest',
    body: 'Withdraw to your bank/UPI or reinvest in new opportunities.',
  },
] as const;

const INVESTMENT_FLOW = [
  'Your Investment',
  'Raw Material Procurement',
  'Tikhat Foods Production',
  'Quality Control & Packaging',
  'Distributor & Retail Network',
  'Customer Sales',
  'Business Revenue',
  'Eligible Profit Sharing',
] as const;

const PRODUCTS = [
  {
    emoji: '🌾',
    title: 'Atta & Flour',
    body: 'Everyday staples for Indian households.',
  },
  {
    emoji: '🍚',
    title: 'Rice',
    body: 'Daily-use and premium rice varieties.',
  },
  {
    emoji: '🫘',
    title: 'Pulses & Dal',
    body: 'Essential nutrition for everyday meals.',
  },
  {
    emoji: '🌶️',
    title: 'Spices',
    body: 'Quality spices for everyday cooking.',
  },
  {
    emoji: '🫙',
    title: 'Edible Oils',
    body: 'Essential cooking products for households.',
  },
  {
    emoji: '📦',
    title: 'Other Daily Essentials',
    body: 'A growing portfolio built around recurring consumer demand.',
  },
] as const;

const DASHBOARD_FEATURES = [
  'Investment Portfolio',
  'Return Tracker',
  'Daily & Weekly Insights',
  'Transaction History',
  'Bank & UPI Withdrawals',
  'Investment Documents',
] as const;

const WHY_CARDS = [
  {
    emoji: '🏭',
    title: 'Real Business',
    body: "Investment capital supports Tikhat Foods' operating business activities.",
  },
  {
    emoji: '🛒',
    title: 'Everyday Products',
    body: 'Our business focuses on grocery categories with recurring consumer demand.',
  },
  {
    emoji: '👁️',
    title: 'Transparent',
    body: 'Track investments, transactions and eligible returns from your dashboard.',
  },
  {
    emoji: '📱',
    title: 'Simple',
    body: 'Invest, monitor and manage your account from one application.',
  },
  {
    emoji: '💳',
    title: 'Accessible',
    body: 'Deposit and withdraw through supported bank and UPI methods.',
  },
  {
    emoji: '📈',
    title: 'Growth Focused',
    body: 'Participate in the expansion of Tikhat Foods ecosystem.',
  },
] as const;

const TRANSPARENCY_ITEMS = [
  'Clear investment terms',
  'Investment performance tracking',
  'Complete transaction history',
  'Return statements',
  'Withdrawal tracking',
  'Bank & UPI integration',
  'Investment documents',
  'Business and production updates',
] as const;

const FOOTER_LINKS: {
  label: string;
  action: 'scroll' | 'route';
  target: SectionKey | Href;
}[] = [
  { label: 'About Tikhat Foods', action: 'scroll', target: 'business' },
  {
    label: 'Investment Opportunities',
    action: 'route',
    target: REGISTER_HREF,
  },
  { label: 'How It Works', action: 'scroll', target: 'how' },
  { label: 'Products', action: 'scroll', target: 'products' },
  { label: 'Help & Support', action: 'scroll', target: 'contact' },
  { label: 'Terms & Conditions', action: 'route', target: TERMS_HREF },
  { label: 'Privacy Policy', action: 'route', target: PRIVACY_HREF },
  { label: 'Risk Disclosure', action: 'scroll', target: 'risk' },
];

function Reveal({
  children,
  visible,
}: {
  children: ReactNode;
  visible: boolean;
}) {
  const opacity = useSharedValue(visible ? 1 : 0);
  const translateY = useSharedValue(visible ? 0 : 28);

  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 520 });
      translateY.value = withTiming(0, { duration: 520 });
    }
  }, [visible, opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={animatedStyle}>{children}</Animated.View>;
}

function SectionPad({
  children,
  backgroundColor,
  onLayout,
  isWide,
  id,
}: {
  children: ReactNode;
  backgroundColor: string;
  onLayout?: (e: LayoutChangeEvent) => void;
  isWide: boolean;
  id?: string;
}) {
  return (
    <View
      nativeID={id}
      onLayout={onLayout}
      style={{
        width: '100%',
        backgroundColor,
        paddingVertical: isWide ? 60 : 40,
        paddingHorizontal: isWide ? 32 : 16,
        alignItems: 'center',
      }}
    >
      {children}
    </View>
  );
}

function SoftCard({
  children,
  style,
}: {
  children: ReactNode;
  style?: object;
}) {
  return (
    <View
      style={[
        styles.softCard,
        {
          backgroundColor: WHITE,
          borderRadius: 16,
          borderColor: BORDER,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

function SectionHeading({
  title,
  subtitle,
  light = false,
  center = true,
}: {
  title: string;
  subtitle?: string;
  light?: boolean;
  center?: boolean;
}) {
  const { typography, spacing } = useTheme();
  return (
    <View
      style={{
        marginBottom: spacing.lg,
        alignItems: center ? 'center' : 'flex-start',
      }}
    >
      <Text
        style={[
          typography.h2,
          {
            color: light ? WHITE : DARK,
            textAlign: center ? 'center' : 'left',
            fontSize: 26,
            lineHeight: 34,
          },
        ]}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text
          style={[
            typography.body,
            {
              color: light ? 'rgba(255,255,255,0.78)' : TEXT_MUTED,
              textAlign: center ? 'center' : 'left',
              marginTop: spacing.sm,
              maxWidth: 560,
              fontSize: 15,
              lineHeight: 22,
            },
          ]}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

function FlowArrow({ horizontal }: { horizontal: boolean }) {
  return (
    <View
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: horizontal ? 0 : 6,
        paddingHorizontal: horizontal ? 6 : 0,
      }}
    >
      <Ionicons
        name={horizontal ? 'arrow-forward' : 'arrow-down'}
        size={18}
        color={ACCENT}
      />
    </View>
  );
}

function CheckRow({ label, light = false }: { label: string; light?: boolean }) {
  const { typography, spacing } = useTheme();
  return (
    <View style={[styles.checkRow, { marginBottom: spacing.sm }]}>
      <Text style={{ color: ACCENT, fontSize: 16, marginRight: 8 }}>✓</Text>
      <Text
        style={[
          typography.body,
          {
            color: light ? WHITE : DARK,
            flex: 1,
            fontSize: 14,
            lineHeight: 20,
          },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

function HeroPattern() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: DARK,
          },
        ]}
      />
      <View
        style={{
          position: 'absolute',
          top: -80,
          right: -60,
          width: 260,
          height: 260,
          borderRadius: 130,
          backgroundColor: ACCENT,
          opacity: 0.08,
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: -40,
          left: -40,
          width: 200,
          height: 200,
          borderRadius: 100,
          backgroundColor: ACCENT,
          opacity: 0.06,
        }}
      />
      {Array.from({ length: 18 }).map((_, i) => (
        <View
          key={`dot-${i}`}
          style={{
            position: 'absolute',
            width: 3,
            height: 3,
            borderRadius: 2,
            backgroundColor: ACCENT,
            opacity: 0.18,
            top: 24 + (i % 6) * 52,
            left: 20 + Math.floor(i / 6) * 120,
          }}
        />
      ))}
    </View>
  );
}

export default function HomePage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { typography, spacing, fonts } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const offsets = useRef<Partial<Record<SectionKey, number>>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [visibleSections, setVisibleSections] = useState<
    Partial<Record<SectionKey, boolean>>
  >({ features: true });
  const scrollYRef = useRef(0);

  const isWide = width >= 768;
  const contentWidth = Math.min(width - (isWide ? 64 : 32), 1080);
  const showNavLinks = width >= 720;

  const markVisible = useCallback(() => {
    const y = scrollYRef.current;
    const viewportBottom = y + height;
    const next: Partial<Record<SectionKey, boolean>> = {};
    (Object.keys(offsets.current) as SectionKey[]).forEach((key) => {
      const top = offsets.current[key];
      if (typeof top === 'number' && top < viewportBottom - 40) {
        next[key] = true;
      }
    });
    setVisibleSections((prev) => ({ ...prev, ...next }));
  }, [height]);

  const onSectionLayout =
    (key: SectionKey) => (event: LayoutChangeEvent) => {
      offsets.current[key] = event.nativeEvent.layout.y;
      markVisible();
    };

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollYRef.current = event.nativeEvent.contentOffset.y;
    markVisible();
  };

  const scrollTo = (key: SectionKey) => {
    setMenuOpen(false);
    const y = offsets.current[key];
    if (typeof y === 'number') {
      scrollRef.current?.scrollTo({
        y: Math.max(0, y - (insets.top + 56)),
        animated: true,
      });
    }
  };

  const go = (href: Href) => {
    setMenuOpen(false);
    router.push(href);
  };

  return (
    <View style={[styles.root, { backgroundColor: WHITE }]}>
      {/* Sticky header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 8,
            paddingHorizontal: isWide ? 32 : 16,
            backgroundColor: DARK,
            borderBottomColor: 'rgba(56,189,248,0.25)',
          },
        ]}
      >
        <Image
          source={Logo}
          style={{ height: 40, width: 140, resizeMode: 'contain' }}
        />

        {showNavLinks ? (
          <View style={styles.navLinks}>
            <Pressable onPress={() => scrollTo('features')} hitSlop={8}>
              <Text style={[typography.subtitle, { color: WHITE }]}>
                Features
              </Text>
            </Pressable>
            <Pressable onPress={() => scrollTo('how')} hitSlop={8}>
              <Text style={[typography.subtitle, { color: WHITE }]}>
                How it works
              </Text>
            </Pressable>
            <Pressable onPress={() => scrollTo('contact')} hitSlop={8}>
              <Text style={[typography.subtitle, { color: WHITE }]}>
                Contact
              </Text>
            </Pressable>
            <Pressable onPress={() => go(LOGIN_HREF)} hitSlop={8}>
              <Text style={[typography.subtitle, { color: ACCENT }]}>
                Login
              </Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={() => setMenuOpen(true)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Open menu"
            style={styles.menuBtn}
          >
            <Ionicons name="menu" size={26} color={WHITE} />
          </Pressable>
        )}
      </View>

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable
          style={styles.menuBackdrop}
          onPress={() => setMenuOpen(false)}
        >
          <View
            style={[
              styles.menuSheet,
              {
                marginTop: insets.top + 56,
                backgroundColor: DARK,
                borderColor: 'rgba(56,189,248,0.3)',
              },
            ]}
          >
            {(
              [
                ['Features', 'features'],
                ['How it works', 'how'],
                ['Contact', 'contact'],
              ] as const
            ).map(([label, key]) => (
              <Pressable
                key={key}
                onPress={() => scrollTo(key)}
                style={styles.menuItem}
              >
                <Text style={[typography.title, { color: WHITE }]}>
                  {label}
                </Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => go(LOGIN_HREF)}
              style={styles.menuItem}
            >
              <Text style={[typography.title, { color: ACCENT }]}>Login</Text>
            </Pressable>
            <Pressable
              onPress={() => go(REGISTER_HREF)}
              style={styles.menuItem}
            >
              <Text style={[typography.title, { color: ACCENT }]}>
                Register
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom }}
      >
        {/* HERO */}
        <View
          style={[
            styles.hero,
            {
              paddingTop: isWide ? 72 : 48,
              paddingBottom: isWide ? 72 : 48,
              paddingHorizontal: isWide ? 32 : 16,
            },
          ]}
        >
          <HeroPattern />
          <View style={{ width: contentWidth, zIndex: 1 }}>
            <Text
              style={[
                typography.caption,
                {
                  color: ACCENT,
                  letterSpacing: 2,
                  fontFamily: fonts.semiBold,
                  marginBottom: spacing.sm,
                },
              ]}
            >
              TIKHAT FOODS
            </Text>
            <Text
              style={[
                typography.h1,
                {
                  color: WHITE,
                  fontSize: isWide ? 40 : 28,
                  lineHeight: isWide ? 48 : 36,
                  maxWidth: 720,
                },
              ]}
            >
              Invest in Everyday Needs. Grow With Tikhat Foods.
            </Text>
            <Text
              style={[
                typography.body,
                {
                  color: 'rgba(255,255,255,0.8)',
                  marginTop: spacing.md,
                  maxWidth: 640,
                  fontSize: 15,
                  lineHeight: 24,
                },
              ]}
            >
              Become a part of Tikhat Foods' growing manufacturing and
              distribution ecosystem. Your investment supports the production
              and distribution of everyday grocery products, while you get the
              opportunity to earn a share from business performance.
            </Text>

            <View
              style={[
                styles.ctaRow,
                { marginTop: spacing.lg, gap: spacing.sm },
              ]}
            >
              <View style={styles.ctaBtn}>
                <Button
                  title="Start Investing"
                  variant="golden"
                  onPress={() => go(REGISTER_HREF)}
                />
              </View>
              <View style={styles.ctaBtn}>
                <Button
                  title="Explore Opportunities"
                  variant="secondary"
                  onPress={() => go(LOGIN_HREF)}
                  textStyle={{ color: WHITE }}
                  style={{ borderColor: WHITE }}
                />
              </View>
            </View>

            <View
              style={[
                styles.badgeRow,
                { marginTop: spacing.lg, gap: spacing.sm },
              ]}
            >
              {['Real Business', 'Transparent Tracking', 'Easy Withdrawals'].map(
                (badge) => (
                  <View
                    key={badge}
                    style={[
                      styles.badge,
                      {
                        borderColor: 'rgba(56,189,248,0.45)',
                        backgroundColor: 'rgba(56,189,248,0.1)',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        typography.caption,
                        { color: ACCENT, fontFamily: fonts.medium },
                      ]}
                    >
                      {badge}
                    </Text>
                  </View>
                )
              )}
            </View>
          </View>
        </View>

        {/* PORTFOLIO OVERVIEW */}
        <SectionPad
          backgroundColor={WHITE}
          isWide={isWide}
          onLayout={onSectionLayout('features')}
        >
          <View style={{ width: contentWidth }}>
            <Reveal visible={!!visibleSections.features}>
              <SectionHeading
                title="Your Investment. At a Glance."
                subtitle="See everything that matters from one simple dashboard."
              />
              <View style={styles.grid2}>
                {PORTFOLIO_CARDS.map((card) => (
                  <SoftCard
                    key={card.title}
                    style={{ width: isWide ? '48%' : '100%' }}
                  >
                    <View
                      style={[
                        styles.iconBubble,
                        { backgroundColor: 'rgba(56,189,248,0.12)' },
                      ]}
                    >
                      <Ionicons name={card.icon} size={22} color={ACCENT} />
                    </View>
                    <Text
                      style={[
                        typography.title,
                        { color: DARK, marginTop: spacing.sm },
                      ]}
                    >
                      {card.title}
                    </Text>
                    <Text
                      style={[
                        typography.body,
                        {
                          color: TEXT_MUTED,
                          marginTop: spacing.xs,
                        },
                      ]}
                    >
                      {card.body}
                    </Text>
                  </SoftCard>
                ))}
              </View>
              <View style={{ marginTop: spacing.lg, maxWidth: 280, alignSelf: 'center' }}>
                <Button
                  title="View Portfolio"
                  variant="golden"
                  onPress={() => go(LOGIN_HREF)}
                />
              </View>
            </Reveal>
          </View>
        </SectionPad>

        {/* BUSINESS CYCLE */}
        <SectionPad
          backgroundColor={GREY}
          isWide={isWide}
          onLayout={onSectionLayout('business')}
        >
          <View style={{ width: contentWidth }}>
            <Reveal visible={!!visibleSections.business}>
              <SectionHeading
                title="Your Money Powers Real Business"
                subtitle="Tikhat Foods manufactures and distributes grocery products designed for everyday household needs."
              />
              <View
                style={[
                  styles.flowWrap,
                  { flexDirection: isWide ? 'row' : 'column' },
                ]}
              >
                {BUSINESS_FLOW.map((step, index) => (
                  <View
                    key={step}
                    style={[
                      styles.flowItem,
                      {
                        flexDirection: isWide ? 'row' : 'column',
                        alignItems: 'center',
                      },
                    ]}
                  >
                    <SoftCard style={styles.flowCard}>
                      <Text
                        style={[
                          typography.subtitle,
                          { color: DARK, textAlign: 'center' },
                        ]}
                      >
                        {step}
                      </Text>
                    </SoftCard>
                    {index < BUSINESS_FLOW.length - 1 ? (
                      <FlowArrow horizontal={isWide} />
                    ) : null}
                  </View>
                ))}
              </View>
              <Text
                style={[
                  typography.title,
                  {
                    color: ACCENT,
                    textAlign: 'center',
                    marginTop: spacing.lg,
                  },
                ]}
              >
                You Invest. We Produce. Together We Grow.
              </Text>
            </Reveal>
          </View>
        </SectionPad>

        {/* HOW IT WORKS */}
        <SectionPad
          backgroundColor={WHITE}
          isWide={isWide}
          onLayout={onSectionLayout('how')}
        >
          <View style={{ width: contentWidth }}>
            <Reveal visible={!!visibleSections.how}>
              <SectionHeading title="How Tikhat Partner Works" />
              <View style={styles.grid2}>
                {HOW_STEPS.map((item) => (
                  <SoftCard
                    key={item.step}
                    style={{ width: isWide ? '48%' : '100%' }}
                  >
                    <Text
                      style={[
                        typography.h3,
                        { color: ACCENT, marginBottom: spacing.xs },
                      ]}
                    >
                      {item.step}
                    </Text>
                    <Text style={[typography.title, { color: DARK }]}>
                      {item.title}
                    </Text>
                    <Text
                      style={[
                        typography.body,
                        { color: TEXT_MUTED, marginTop: spacing.xs },
                      ]}
                    >
                      {item.body}
                    </Text>
                  </SoftCard>
                ))}
              </View>
            </Reveal>
          </View>
        </SectionPad>

        {/* INVESTMENT FLOW */}
        <SectionPad backgroundColor={DARK} isWide={isWide}>
          <View style={{ width: contentWidth }}>
            <SectionHeading
              title="See Where Your Investment Goes"
              subtitle="From Capital to Consumer"
              light
            />
            <View style={{ alignItems: 'center' }}>
              {INVESTMENT_FLOW.map((step, index) => (
                <View key={step} style={{ alignItems: 'center', width: '100%' }}>
                  <View
                    style={[
                      styles.investStep,
                      {
                        borderColor: 'rgba(56,189,248,0.35)',
                        backgroundColor: 'rgba(56,189,248,0.08)',
                        width: '100%',
                        maxWidth: 420,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        typography.subtitle,
                        { color: WHITE, textAlign: 'center' },
                      ]}
                    >
                      {step}
                    </Text>
                  </View>
                  {index < INVESTMENT_FLOW.length - 1 ? (
                    <View style={styles.flowLine}>
                      <View
                        style={{
                          width: 2,
                          height: 18,
                          backgroundColor: ACCENT,
                          opacity: 0.7,
                        }}
                      />
                      <Ionicons name="chevron-down" size={16} color={ACCENT} />
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          </View>
        </SectionPad>

        {/* PRODUCTS */}
        <SectionPad
          backgroundColor={WHITE}
          isWide={isWide}
          onLayout={onSectionLayout('products')}
        >
          <View style={{ width: contentWidth }}>
            <Reveal visible={!!visibleSections.products}>
              <SectionHeading
                title="Built Around Everyday Consumption"
                subtitle="Products People Need Every Day"
              />
              <View style={styles.grid2}>
                {PRODUCTS.map((item) => (
                  <SoftCard
                    key={item.title}
                    style={{ width: isWide ? '31.5%' : '100%' }}
                  >
                    <Text style={{ fontSize: 28, marginBottom: spacing.xs }}>
                      {item.emoji}
                    </Text>
                    <Text style={[typography.title, { color: DARK }]}>
                      {item.title}
                    </Text>
                    <Text
                      style={[
                        typography.body,
                        { color: TEXT_MUTED, marginTop: spacing.xs },
                      ]}
                    >
                      {item.body}
                    </Text>
                  </SoftCard>
                ))}
              </View>
            </Reveal>
          </View>
        </SectionPad>

        {/* DASHBOARD PREVIEW */}
        <SectionPad
          backgroundColor={GREY}
          isWide={isWide}
          onLayout={onSectionLayout('dashboard')}
        >
          <View style={{ width: contentWidth }}>
            <Reveal visible={!!visibleSections.dashboard}>
              <SectionHeading
                title="Your Partner Dashboard"
                subtitle="Everything About Your Investment. In One Place."
              />
              <View style={styles.grid2}>
                {DASHBOARD_FEATURES.map((label) => (
                  <SoftCard
                    key={label}
                    style={{
                      width: isWide ? '48%' : '100%',
                      flexDirection: 'row',
                      alignItems: 'center',
                    }}
                  >
                    <Text
                      style={{
                        color: ACCENT,
                        fontSize: 18,
                        marginRight: 10,
                        fontFamily: fonts.bold,
                      }}
                    >
                      ✓
                    </Text>
                    <Text style={[typography.subtitle, { color: DARK, flex: 1 }]}>
                      {label}
                    </Text>
                  </SoftCard>
                ))}
              </View>
            </Reveal>
          </View>
        </SectionPad>

        {/* WHY TIKHAT PARTNER */}
        <SectionPad
          backgroundColor={WHITE}
          isWide={isWide}
          onLayout={onSectionLayout('why')}
        >
          <View style={{ width: contentWidth }}>
            <Reveal visible={!!visibleSections.why}>
              <SectionHeading title="Why Tikhat Partner?" />
              <View style={styles.grid2}>
                {WHY_CARDS.map((card) => (
                  <SoftCard
                    key={card.title}
                    style={{ width: isWide ? '31.5%' : '100%' }}
                  >
                    <Text style={{ fontSize: 28, marginBottom: spacing.xs }}>
                      {card.emoji}
                    </Text>
                    <Text style={[typography.title, { color: DARK }]}>
                      {card.title}
                    </Text>
                    <Text
                      style={[
                        typography.body,
                        { color: TEXT_MUTED, marginTop: spacing.xs },
                      ]}
                    >
                      {card.body}
                    </Text>
                  </SoftCard>
                ))}
              </View>
            </Reveal>
          </View>
        </SectionPad>

        {/* TRANSPARENCY */}
        <SectionPad
          backgroundColor={DARK}
          isWide={isWide}
          onLayout={onSectionLayout('transparency')}
        >
          <View style={{ width: contentWidth }}>
            <Reveal visible={!!visibleSections.transparency}>
              <SectionHeading
                title="Transparency at Every Step"
                subtitle="Know Your Money. Know Your Business."
                light
              />
              <View style={styles.grid2}>
                {TRANSPARENCY_ITEMS.map((item) => (
                  <View
                    key={item}
                    style={{ width: isWide ? '48%' : '100%' }}
                  >
                    <CheckRow label={item} light />
                  </View>
                ))}
              </View>
              <Text
                style={[
                  typography.h3,
                  {
                    color: WHITE,
                    textAlign: 'center',
                    marginTop: spacing.lg,
                  },
                ]}
              >
                More Than an Investor. Become a Tikhat Partner.
              </Text>
              <Text
                style={[
                  typography.body,
                  {
                    color: 'rgba(255,255,255,0.78)',
                    textAlign: 'center',
                    marginTop: spacing.sm,
                    maxWidth: 640,
                    alignSelf: 'center',
                    lineHeight: 22,
                  },
                ]}
              >
                When you invest through Tikhat Partner, your capital becomes
                part of a larger business ecosystem built around manufacturing,
                distribution and everyday consumer demand.
              </Text>
            </Reveal>
          </View>
        </SectionPad>

        {/* CTA */}
        <SectionPad
          backgroundColor={ACCENT}
          isWide={isWide}
          onLayout={onSectionLayout('contact')}
        >
          <View style={{ width: contentWidth, alignItems: 'center' }}>
            <Reveal visible={!!visibleSections.contact}>
              <Text
                style={[
                  typography.h2,
                  {
                    color: DARK,
                    textAlign: 'center',
                    fontSize: 26,
                    lineHeight: 34,
                  },
                ]}
              >
                Ready to Become a Tikhat Partner?
              </Text>
              <Text
                style={[
                  typography.body,
                  {
                    color: DARK,
                    textAlign: 'center',
                    marginTop: spacing.sm,
                    marginBottom: spacing.lg,
                    opacity: 0.85,
                    fontSize: 15,
                  },
                ]}
              >
                Invest in Products People Use Every Day.
              </Text>
              <View
                style={[
                  styles.ctaRow,
                  { gap: spacing.sm, justifyContent: 'center' },
                ]}
              >
                <View style={styles.ctaBtn}>
                  <Button
                    title="Explore Investments"
                    variant="primary"
                    onPress={() => go(REGISTER_HREF)}
                  />
                </View>
                <View style={[styles.ctaBtn, { minWidth: isWide ? 280 : undefined }]}>
                  <Button
                    title="Already a partner? View Portfolio"
                    variant="secondary"
                    onPress={() => go(LOGIN_HREF)}
                    textStyle={{ color: DARK }}
                    style={{ borderColor: DARK, backgroundColor: WHITE }}
                  />
                </View>
              </View>
            </Reveal>
          </View>
        </SectionPad>

        {/* FOOTER */}
        <View
          onLayout={onSectionLayout('risk')}
          style={[
            styles.footer,
            {
              backgroundColor: DARK,
              paddingTop: isWide ? 48 : 36,
              paddingBottom: 28 + insets.bottom,
              paddingHorizontal: isWide ? 32 : 16,
            },
          ]}
        >
          <View style={{ width: contentWidth, alignSelf: 'center' }}>
            <Image
              source={Logo}
              style={{ height: 40, width: 140, resizeMode: 'contain' }}
            />

            <View style={[styles.contactBlock, { marginTop: spacing.lg }]}>
              <Pressable
                onPress={() => {
                  void Linking.openURL('mailto:support@tikhatpartner.online');
                }}
                style={styles.contactRow}
                hitSlop={8}
                accessibilityRole="link"
                accessibilityLabel="Email support"
              >
                <Ionicons name="mail-outline" size={16} color={ACCENT} />
                <Text
                  style={[
                    typography.caption,
                    { color: WHITE, marginLeft: 8 },
                  ]}
                >
                  support@tikhatpartner.online
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  void Linking.openURL('tel:+918840737660');
                }}
                style={[styles.contactRow, { marginTop: spacing.sm }]}
                hitSlop={8}
                accessibilityRole="link"
                accessibilityLabel="Call support"
              >
                <Ionicons name="call-outline" size={16} color={ACCENT} />
                <Text
                  style={[
                    typography.caption,
                    { color: WHITE, marginLeft: 8 },
                  ]}
                >
                  +91 8840737660
                </Text>
              </Pressable>
            </View>

            <View
              style={[
                styles.footerLinks,
                { marginTop: spacing.lg, gap: spacing.sm },
              ]}
            >
              {FOOTER_LINKS.map((link, index) => (
                <View key={link.label} style={styles.footerLinkWrap}>
                  <Pressable
                    onPress={() => {
                      if (link.action === 'scroll') {
                        scrollTo(link.target as SectionKey);
                      } else {
                        go(link.target as Href);
                      }
                    }}
                    hitSlop={6}
                  >
                    <Text
                      style={[
                        typography.caption,
                        { color: 'rgba(255,255,255,0.85)' },
                      ]}
                    >
                      {link.label}
                    </Text>
                  </Pressable>
                  {index < FOOTER_LINKS.length - 1 ? (
                    <Text
                      style={[
                        typography.caption,
                        { color: 'rgba(255,255,255,0.35)', marginHorizontal: 6 },
                      ]}
                    >
                      •
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>

            <Text
              style={[
                typography.caption,
                {
                  color: 'rgba(255,255,255,0.55)',
                  marginTop: spacing.lg,
                  lineHeight: 18,
                  maxWidth: 720,
                },
              ]}
            >
              Investments involve financial and business risks. Returns should
              not be considered guaranteed unless specifically supported by an
              applicable contractual or regulated structure.
            </Text>

            <Text
              style={[
                typography.caption,
                {
                  color: 'rgba(255,255,255,0.65)',
                  marginTop: spacing.md,
                },
              ]}
            >
              © 2024 Tikhat Foods. All rights reserved. | Tikhat Partner
              Platform
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    zIndex: 20,
  },
  navLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 22,
  },
  menuBtn: {
    padding: 4,
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(10,22,40,0.55)',
  },
  menuSheet: {
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 8,
    overflow: 'hidden',
  },
  menuItem: {
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  hero: {
    width: '100%',
    overflow: 'hidden',
    alignItems: 'center',
    position: 'relative',
  },
  ctaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  ctaBtn: {
    flexGrow: 1,
    flexBasis: 160,
    minWidth: 150,
    maxWidth: 320,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  softCard: {
    borderWidth: 1,
    padding: 16,
    shadowColor: '#0A1628',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    marginBottom: 12,
  },
  grid2: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flowWrap: {
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
  },
  flowItem: {
    marginBottom: 4,
  },
  flowCard: {
    minWidth: 120,
    paddingVertical: 14,
    paddingHorizontal: 12,
    marginBottom: 0,
  },
  investStep: {
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  flowLine: {
    alignItems: 'center',
    paddingVertical: 2,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  footer: {
    width: '100%',
  },
  contactBlock: {
    alignItems: 'flex-start',
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  footerLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  footerLinkWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
