export default function LogoDelParque({ size = 32 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Del Parque"
    >
      {/* Body */}
      <ellipse cx="20" cy="31" rx="12" ry="14" fill="#111827" />
      {/* Belly */}
      <ellipse cx="20" cy="33" rx="7" ry="9.5" fill="#F9FAFB" />
      {/* Head */}
      <circle cx="20" cy="13" r="10" fill="#111827" />
      {/* Face patch */}
      <ellipse cx="20" cy="14" rx="6.5" ry="6" fill="#F9FAFB" />
      {/* Left eye */}
      <circle cx="17" cy="11.5" r="1.8" fill="#111827" />
      <circle cx="16.4" cy="11" r="0.7" fill="white" />
      {/* Right eye */}
      <circle cx="23" cy="11.5" r="1.8" fill="#111827" />
      <circle cx="22.4" cy="11" r="0.7" fill="white" />
      {/* Beak */}
      <polygon points="17.5,15.5 20,18.5 22.5,15.5" fill="#FF4713" />
      {/* Left wing */}
      <ellipse cx="8.5" cy="29" rx="4" ry="8.5" fill="#111827" transform="rotate(-12 8.5 29)" />
      {/* Right wing */}
      <ellipse cx="31.5" cy="29" rx="4" ry="8.5" fill="#111827" transform="rotate(12 31.5 29)" />
      {/* Left foot */}
      <ellipse cx="15" cy="45" rx="4.5" ry="2" fill="#FF4713" />
      {/* Right foot */}
      <ellipse cx="25" cy="45" rx="4.5" ry="2" fill="#FF4713" />
    </svg>
  )
}
