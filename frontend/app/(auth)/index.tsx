import { useRef } from 'react';
import { useRouter, type Href } from 'expo-router';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  APP_NAME,
  COMPANY_NAME,
  DOMAIN,
  INVESTOR_TERM,
} from '../../constants';
import { useTheme } from '../../hooks/useTheme';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Divider } from '../../components/ui/Divider';
import Logo from '@/assets/logo.png';

const LOGIN_HREF = '/(auth)/login' as Href;
const REGISTER_HREF = '/(auth)/register' as Href;

const FEATURES = [
  {
    title: 'Transparent Capital Tracking',
    body: '[REPLACE WITH ACTUAL CONTENT] Monitor your capital balance, deposits, and withdrawals in real time with clear transaction IDs.',
    icon: 'C',
  },
  {
    title: 'Daily Revenue Credits',
    body: '[REPLACE WITH ACTUAL CONTENT] Receive scheduled revenue credits based on your partnership terms, visible in your ledger.',
    icon: 'R',
  },
  {
    title: 'Secure Partner Access',
    body: '[REPLACE WITH ACTUAL CONTENT] OTP-secured login, session controls, and admin-verified KYC to protect every partner account.',
    icon: 'S',
  },
  {
    title: 'Dedicated Support',
    body: '[REPLACE WITH ACTUAL CONTENT] Raise tickets anytime and track responses from the Tikhat Partner support desk.',
    icon: 'H',
  },
] as const;

const STEPS = [
  {
    step: '01',
    title: 'Register',
    body: '[REPLACE WITH ACTUAL CONTENT] Create your Tikhat Partner account and submit your details for verification.',
  },
  {
    step: '02',
    title: 'Get Approved',
    body: '[REPLACE WITH ACTUAL CONTENT] Our admin team reviews your registration and KYC before activating access.',
  },
  {
    step: '03',
    title: 'Start Partnering',
    body: '[REPLACE WITH ACTUAL CONTENT] Add capital, track revenue credits, and manage withdrawals from one dashboard.',
  },
] as const;

type SectionKey = 'hero' | 'features' | 'how' | 'about' | 'contact';

export default function HomePage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { colors, spacing, typography, borderRadius, isDark } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const offsets = useRef<Partial<Record<SectionKey, number>>>({});

  const contentWidth = Math.min(width, 720);
  const year = new Date().getFullYear();

  const onSectionLayout =
    (key: SectionKey) => (event: LayoutChangeEvent) => {
      offsets.current[key] = event.nativeEvent.layout.y;
    };

  const scrollTo = (key: SectionKey) => {
    const y = offsets.current[key];
    if (typeof y === 'number') {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.topBar,
          {
            paddingTop: insets.top + spacing.sm,
            paddingHorizontal: spacing.md,
            backgroundColor: colors.primary,
            borderBottomColor: colors.secondary,
          },
        ]}
      >
        <Text style={[typography.title, { color: colors.secondary }]}>
          {APP_NAME}
        </Text>
        <View style={styles.topLinks}>
          <Pressable onPress={() => scrollTo('features')} hitSlop={8}>
            <Text style={[typography.caption, { color: colors.text.inverse }]}>
              Features
            </Text>
          </Pressable>
          <Pressable onPress={() => scrollTo('how')} hitSlop={8}>
            <Text style={[typography.caption, { color: colors.text.inverse }]}>
              How it works
            </Text>
          </Pressable>
          <Pressable onPress={() => scrollTo('contact')} hitSlop={8}>
            <Text style={[typography.caption, { color: colors.text.inverse }]}>
              Contact
            </Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{
          paddingBottom: insets.bottom + spacing.xl,
          alignItems: 'center',
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View
          onLayout={onSectionLayout('hero')}
          style={[
            styles.hero,
            {
              backgroundColor: colors.primary,
              paddingHorizontal: spacing.md,
              paddingTop: spacing.xl,
              paddingBottom: spacing.xxl,
              width: '100%',
            },
          ]}
        >
          <View style={{ width: contentWidth, maxWidth: '100%', alignSelf: 'center' }}>
            <Text
              style={[
                typography.caption,
                {
                  color: colors.secondary,
                  letterSpacing: 1.4,
                  textTransform: 'uppercase',
                  marginBottom: spacing.sm,
                },
              ]}
            >
              {COMPANY_NAME}
            </Text>
            <Image
              source={Logo}
              style={{ height: 60, resizeMode: 'contain' }}
            />
            <Text
              style={[
                typography.body,
                {
                  color: colors.text.secondary,
                  marginTop: spacing.md,
                  maxWidth: 480,
                },
              ]}
            >
              [REPLACE WITH ACTUAL CONTENT] A secure partner platform for capital
              participation, daily revenue visibility, and transparent
              withdrawals — built for {INVESTOR_TERM}s.
            </Text>

            <View
              style={[
                styles.ctaRow,
                { marginTop: spacing.lg, gap: spacing.sm },
              ]}
            >
              <View style={styles.ctaBtn}>
                <Button
                  title="Login"
                  variant="golden"
                  onPress={() => router.push(LOGIN_HREF)}
                />
              </View>
              <View style={styles.ctaBtn}>
                <Button
                  title="Register"
                  variant="secondary"
                  onPress={() => router.push(REGISTER_HREF)}
                  textStyle={{ color: colors.text.inverse }}
                  style={{
                    borderColor: colors.secondary,
                  }}
                />
              </View>
            </View>
          </View>
        </View>

        {/* Features */}
        <View
          onLayout={onSectionLayout('features')}
          style={[
            styles.section,
            { width: contentWidth, maxWidth: '100%', paddingHorizontal: spacing.md },
          ]}
        >
          <Text style={[typography.h2, { color: colors.text.primary }]}>
            Features
          </Text>
          <Text
            style={[
              typography.body,
              { color: colors.text.secondary, marginTop: spacing.xs, marginBottom: spacing.md },
            ]}
          >
            [REPLACE WITH ACTUAL CONTENT] Why partners choose Tikhat.
          </Text>

          <View style={{ gap: spacing.md }}>
            {FEATURES.map((feature) => (
              <Card key={feature.title}>
                <View style={styles.featureHead}>
                  <View
                    style={[
                      styles.iconBubble,
                      {
                        backgroundColor: colors.surface,
                        borderRadius: borderRadius.md,
                        borderWidth: 1,
                        borderColor: colors.secondary,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        typography.title,
                        { color: colors.secondary, fontWeight: '700' },
                      ]}
                    >
                      {feature.icon}
                    </Text>
                  </View>
                  <Text
                    style={[
                      typography.title,
                      { color: colors.text.primary, flex: 1 },
                    ]}
                  >
                    {feature.title}
                  </Text>
                </View>
                <Text
                  style={[
                    typography.body,
                    { color: colors.text.secondary, marginTop: spacing.sm },
                  ]}
                >
                  {feature.body}
                </Text>
              </Card>
            ))}
          </View>
        </View>

        {/* How it works */}
        <View
          onLayout={onSectionLayout('how')}
          style={[
            styles.section,
            {
              width: '100%',
              backgroundColor: isDark ? colors.surface : colors.surface,
              paddingVertical: spacing.xl,
              paddingHorizontal: spacing.md,
              alignItems: 'center',
            },
          ]}
        >
          <View style={{ width: contentWidth, maxWidth: '100%' }}>
            <Text style={[typography.h2, { color: colors.text.primary }]}>
              How it works
            </Text>
            <Text
              style={[
                typography.body,
                {
                  color: colors.text.secondary,
                  marginTop: spacing.xs,
                  marginBottom: spacing.md,
                },
              ]}
            >
              [REPLACE WITH ACTUAL CONTENT] Three simple steps to get started.
            </Text>

            <View style={{ gap: spacing.md }}>
              {STEPS.map((item) => (
                <View
                  key={item.step}
                  style={[
                    styles.stepRow,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.card,
                      borderRadius: borderRadius.lg,
                      padding: spacing.md,
                    },
                  ]}
                >
                  <Text
                    style={[
                      typography.h3,
                      { color: colors.secondary, marginRight: spacing.md },
                    ]}
                  >
                    {item.step}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[typography.title, { color: colors.text.primary }]}
                    >
                      {item.title}
                    </Text>
                    <Text
                      style={[
                        typography.body,
                        { color: colors.text.secondary, marginTop: spacing.xs },
                      ]}
                    >
                      {item.body}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* About */}
        <View
          onLayout={onSectionLayout('about')}
          style={[
            styles.section,
            { width: contentWidth, maxWidth: '100%', paddingHorizontal: spacing.md },
          ]}
        >
          <Text style={[typography.h2, { color: colors.text.primary }]}>
            About us
          </Text>
          <Text
            style={[
              typography.body,
              { color: colors.text.secondary, marginTop: spacing.sm },
            ]}
          >
            [REPLACE WITH ACTUAL CONTENT] {COMPANY_NAME} partners with trusted
            investors through the {APP_NAME} platform. This section will describe
            our food business, partnership philosophy, and long-term commitment
            to transparency.
          </Text>
        </View>

        {/* Contact */}
        <View
          onLayout={onSectionLayout('contact')}
          style={[
            styles.section,
            { width: contentWidth, maxWidth: '100%', paddingHorizontal: spacing.md },
          ]}
        >
          <Text style={[typography.h2, { color: colors.text.primary }]}>
            Contact
          </Text>
          <Card style={{ marginTop: spacing.md }}>
            <Text style={[typography.label, { color: colors.text.secondary }]}>
              Email
            </Text>
            <Text
              style={[
                typography.body,
                { color: colors.text.primary, marginTop: spacing.xs },
              ]}
            >
              [REPLACE WITH ACTUAL CONTENT] support@{DOMAIN}
            </Text>
            <Divider spacing={spacing.md} />
            <Text style={[typography.label, { color: colors.text.secondary }]}>
              Phone
            </Text>
            <Text
              style={[
                typography.body,
                { color: colors.text.primary, marginTop: spacing.xs },
              ]}
            >
              [REPLACE WITH ACTUAL CONTENT] +91 XXXXX XXXXX
            </Text>
          </Card>

          <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
            <Button
              title="Become a Partner — Register"
              variant="golden"
              onPress={() => router.push(REGISTER_HREF)}
            />
            <Button
              title="Already a Partner — Login"
              variant="primary"
              onPress={() => router.push(LOGIN_HREF)}
            />
          </View>
        </View>

        {/* Footer */}
        <View
          style={[
            styles.footer,
            {
              width: '100%',
              backgroundColor: colors.primary,
              paddingHorizontal: spacing.md,
              paddingTop: spacing.lg,
              paddingBottom: spacing.lg + insets.bottom,
              alignItems: 'center',
            },
          ]}
        >
          <View style={{ width: contentWidth, maxWidth: '100%' }}>
            <Text style={[typography.title, { color: colors.secondary }]}>
              {COMPANY_NAME}
            </Text>
            <Text
              style={[
                typography.subtitle,
                { color: colors.text.inverse, marginTop: spacing.xs },
              ]}
            >
              {DOMAIN}
            </Text>
            <Text
              style={[
                typography.caption,
                {
                  color: colors.text.secondary,
                  marginTop: spacing.md,
                },
              ]}
            >
              © {year} {COMPANY_NAME}. All rights reserved.
            </Text>
            <Text
              style={[
                typography.caption,
                { color: colors.text.secondary, marginTop: spacing.xs },
              ]}
            >
              [REPLACE WITH ACTUAL CONTENT] Legal disclaimer and partnership
              terms summary.
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 2,
    zIndex: 2,
  },
  topLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  hero: {
    alignItems: 'center',
  },
  ctaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  ctaBtn: {
    flexGrow: 1,
    flexBasis: 140,
    minWidth: 140,
    maxWidth: 220,
  },
  section: {
    paddingTop: 32,
    paddingBottom: 8,
  },
  featureHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBubble: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
  },
  footer: {},
});
