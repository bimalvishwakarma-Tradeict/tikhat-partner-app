export const fonts = {
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semiBold: 'Poppins_700Bold',
  bold: 'Poppins_700Bold',
} as const;

/**
 * Hierarchy (Task 25.4):
 * titles 18px Bold · subtitles 14px SemiBold · body 14px Regular · captions 12px Regular
 */
export const typography = {
  h1: {
    fontFamily: fonts.bold,
    fontSize: 28,
    lineHeight: 34,
  },
  h2: {
    fontFamily: fonts.bold,
    fontSize: 22,
    lineHeight: 28,
  },
  h3: {
    fontFamily: fonts.bold,
    fontSize: 18,
    lineHeight: 24,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 18,
    lineHeight: 24,
  },
  amount: {
    fontFamily: fonts.bold,
    fontSize: 24,
    lineHeight: 30,
  },
  body: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  button: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
    lineHeight: 20,
  },
  label: {
    fontFamily: fonts.medium,
    fontSize: 13,
    lineHeight: 18,
  },
  subtitle: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    lineHeight: 20,
  },
  caption: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 16,
  },
} as const;
