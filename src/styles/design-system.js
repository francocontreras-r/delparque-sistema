import { tokens } from './tokens'

// Compatibilidad con páginas existentes: mapea los tokens nuevos a los
// nombres de color usados históricamente en el código.
export const colors = {
  brand:        tokens.colors.brand,
  brandDark:    tokens.colors.brandDark,
  brandLight:   tokens.colors.brandLight,
  sidebar:      tokens.colors.sidebar,
  sidebarActive:tokens.colors.sidebarActive,
  sidebarHover: tokens.colors.sidebarHover,
  bg:           tokens.colors.bg,
  surface:      tokens.colors.surface,
  border:       tokens.colors.border,
  borderStrong: tokens.colors.borderStrong,
  textPrimary:  tokens.colors.text,
  textSecondary:tokens.colors.textSecondary,
  textMuted:    tokens.colors.textMuted,
  success:      tokens.colors.success,
  successBg:    tokens.colors.successBg,
  successBorder:tokens.colors.successBorder,
  warning:      tokens.colors.warning,
  warningBg:    tokens.colors.warningBg,
  warningBorder:tokens.colors.warningBorder,
  danger:       tokens.colors.danger,
  dangerBg:     tokens.colors.dangerBg,
  dangerBorder: tokens.colors.dangerBorder,
  info:         tokens.colors.info,
  infoBg:       tokens.colors.infoBg,
  infoBorder:   tokens.colors.infoBorder,
}

export const radius = {
  sm:  '6px',
  md:  '8px',
  lg:  '12px',
  xl:  '16px',
  full:'9999px',
}

export const shadow = {
  xs: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  sm: tokens.shadow.sm,
  md: tokens.shadow.md,
  lg: tokens.shadow.lg,
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.1),  0 8px 10px -6px rgb(0 0 0 / 0.05)',
}

// Clases de botón reutilizables (se aplican como string en className)
export const btn = {
  primary:   'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg transition-all duration-150',
  secondary: 'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-all duration-150',
  danger:    'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg transition-all duration-150',
}
