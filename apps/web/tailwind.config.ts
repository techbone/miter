import type { Config } from 'tailwindcss';

const v = (n: string) => `rgb(var(--${n}) / <alpha-value>)`;

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'), surface: v('surface'), 'surface-2': v('surface-2'), line: v('border'),
        fg: v('text'), muted: v('muted'), accent: v('accent'), broken: v('broken'), proven: v('proven'),
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular'],
      },
      fontSize: {
        xs: ['12px', '16px'], sm: ['13px', '18px'], base: ['14px', '20px'], md: ['16px', '24px'],
        lg: ['20px', '28px'], xl: ['28px', '34px'], '2xl': ['40px', '44px'],
      },
      borderRadius: { ctl: '6px', card: '10px' },
      maxWidth: { page: '1120px' },
    },
  },
  plugins: [],
} satisfies Config;
