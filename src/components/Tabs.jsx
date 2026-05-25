import { NavLink } from 'react-router-dom';
import './Tabs.css';

/**
 * Bottom tab bar. `items` is an array of { to, label, icon }.
 * The icon is a small inline SVG component.
 */
export default function Tabs({ items }) {
  return (
    <nav className="tabs" aria-label="Navegação principal">
      <ul className="tabs__list">
        {items.map(({ to, label, icon: Icon }) => (
          <li key={to} className="tabs__item">
            <NavLink
              to={to}
              className={({ isActive }) =>
                'tabs__link' + (isActive ? ' is-active' : '')
              }
            >
              <span className="tabs__icon" aria-hidden="true">
                <Icon />
              </span>
              <span className="tabs__label">{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
