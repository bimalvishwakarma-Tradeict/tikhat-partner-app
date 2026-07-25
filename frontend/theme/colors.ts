export type ThemeColors = {
  primary: string;
  secondary: string;
  background: string;
  surface: string;
  card: string;
  text: {
    primary: string;
    secondary: string;
    inverse: string;
    golden: string;
  };
  border: string;
  error: string;
  success: string;
  warning: string;
  pending: string;
  approved: string;
  rejected: string;
  completed: string;
  cancelled: string;
  skeleton: {
    background: string;
    shimmer: string;
  };
};

export const lightColors: ThemeColors = {
  primary: '#0A1628',
  secondary: '#38BDF8',
  background: '#FFFFFF',
  surface: '#F8F9FA',
  card: '#FFFFFF',
  text: {
    primary: '#0A1628',
    secondary: '#6B7280',
    inverse: '#FFFFFF',
    golden: '#38BDF8',
  },
  border: '#E5E7EB',
  error: '#EF4444',
  success: '#10B981',
  warning: '#F59E0B',
  pending: '#F59E0B',
  approved: '#10B981',
  rejected: '#EF4444',
  completed: '#3B82F6',
  cancelled: '#6B7280',
  skeleton: {
    background: '#F3F4F6',
    shimmer: '#E5E7EB',
  },
};

export const darkColors: ThemeColors = {
  primary: '#0A1628',
  secondary: '#38BDF8',
  background: '#0A1628',
  surface: '#1E2D45',
  card: '#1E2D45',
  text: {
    primary: '#FFFFFF',
    secondary: '#9CA3AF',
    inverse: '#0A1628',
    golden: '#38BDF8',
  },
  border: '#2D3F5C',
  error: '#EF4444',
  success: '#10B981',
  warning: '#F59E0B',
  pending: '#F59E0B',
  approved: '#10B981',
  rejected: '#EF4444',
  completed: '#3B82F6',
  cancelled: '#6B7280',
  skeleton: {
    background: '#1E2D45',
    shimmer: '#2D3F5C',
  },
};
