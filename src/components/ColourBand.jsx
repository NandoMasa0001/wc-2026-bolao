import './ColourBand.css';

/**
 * The signature 4px horizontal stripe that cycles
 * blue → green → lime → gold → orange → red.
 *
 * Use at the top of the header and as a divider above leaderboards.
 */
export default function ColourBand({ className = '' }) {
  return <div className={`colour-band ${className}`.trim()} aria-hidden="true" />;
}
