/**
 * Ember's visual language: a warm, dim room rather than an office.
 *
 * The two series colors (you / partner) were validated for the dark card
 * surface with a CVD + contrast palette checker — don't tweak them casually.
 */
export const colors = {
  bg: '#171210',
  card: '#221a16',
  cardRaised: '#2b211c',
  hairline: '#38302a',

  text: '#f5ede6',
  textDim: '#b3a79c',
  muted: '#8a7f75',

  ember: '#e07030', // "you" series + primary actions
  emberSoft: 'rgba(224, 112, 48, 0.16)',
  violet: '#9085e9', // "partner" series
  violetSoft: 'rgba(144, 133, 233, 0.16)',

  glow: '#ffb86b',
  danger: '#e66767',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radius = {
  sm: 8,
  md: 14,
  lg: 22,
  pill: 999,
};

export const type = {
  title: { fontSize: 28, fontWeight: '700' as const, color: colors.text },
  heading: { fontSize: 19, fontWeight: '600' as const, color: colors.text },
  body: { fontSize: 16, color: colors.text, lineHeight: 23 },
  dim: { fontSize: 15, color: colors.textDim, lineHeight: 21 },
  small: { fontSize: 13, color: colors.muted },
};
