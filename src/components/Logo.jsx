import { LOGO_HORIZONTAL, LOGO_ISOTIPO } from '../assets/logos'

export function LogoCompleto({ height = 40, style = {} }) {
  return (
    <img src={LOGO_HORIZONTAL} alt="Del Parque"
      style={{ height, objectFit: 'contain', display: 'block', ...style }} />
  )
}

export function LogoIsotipo({ size = 32, style = {} }) {
  return (
    <img src={LOGO_ISOTIPO} alt="Del Parque"
      style={{ height: size, width: size, objectFit: 'contain', display: 'block', ...style }} />
  )
}
