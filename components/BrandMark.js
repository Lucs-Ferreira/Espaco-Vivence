export default function BrandMark({ size = 24, className = '' }) {
  return (
    <span
      className={`vivence-brand-mark ${className}`.trim()}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}
