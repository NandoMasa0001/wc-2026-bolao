import './Card.css';

export default function Card({ as: As = 'div', className = '', children, ...rest }) {
  return (
    <As className={`card ${className}`.trim()} {...rest}>
      {children}
    </As>
  );
}
