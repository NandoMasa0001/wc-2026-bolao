import './TeamChip.css';

/**
 * TeamChip — flag + name + optional 3-letter code.
 * Variants:
 *  - size: "sm" | "md" | "lg"
 *  - layout: "row" (default) | "stacked"
 *  - selected: lime ring (advancement picker state)
 *  - placeholder: render a generic placeholder when team unknown
 */
export default function TeamChip({
  team,
  placeholder,
  size = 'md',
  layout = 'row',
  showCode = false,
  selected = false,
  className = ''
}) {
  const classes = [
    'team-chip',
    `team-chip--${size}`,
    `team-chip--${layout}`,
    selected ? 'is-selected' : '',
    !team && placeholder ? 'team-chip--placeholder' : '',
    className
  ].filter(Boolean).join(' ');

  if (!team && placeholder) {
    return (
      <span className={classes}>
        <span className="team-chip__flag team-chip__flag--placeholder" aria-hidden="true">?</span>
        <span className="team-chip__text">
          <span className="team-chip__name">{placeholder}</span>
        </span>
      </span>
    );
  }

  if (!team) return null;

  return (
    <span className={classes}>
      <img
        className="team-chip__flag"
        src={team.flagUrl}
        alt={team.name}
        loading="lazy"
        width="32"
        height="22"
      />
      <span className="team-chip__text">
        <span className="team-chip__name">{team.name}</span>
        {showCode && <span className="team-chip__code">{team.code}</span>}
      </span>
    </span>
  );
}
