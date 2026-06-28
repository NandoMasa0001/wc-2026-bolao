/**
 * locking.js — single source of truth for "are this match's predictions
 * closed?". Pure and framework-free so the UI and any preview logic agree.
 *
 * The hard lock is still the Supabase RLS (`is_match_open`), which compares
 * `kickoff_at` to the server clock and is cron-independent. This module
 * mirrors that rule on the client using the device's local time, so a
 * player can never see the score stepper — or peek at other people's
 * picks — for a match that has already kicked off, even if the cron hasn't
 * flipped its status yet.
 *
 *   - Group / friendly matches: lock globally at the tournament's opening
 *     kickoff (`tournamentStartsAt`).
 *   - Knockout matches: lock individually at each match's own kickoff, and
 *     stay locked while the teams are still unknown (placeholder).
 *   - Any match the feed already marks live/finished is locked regardless.
 */
export function isMatchLocked(match, tournamentStartsAt, now = Date.now()) {
  if (!match) return true;
  if (match.status && match.status !== 'scheduled') return true; // live/finished

  const isKnockout = match.stage !== 'group' && match.stage !== 'friendly';
  if (isKnockout) {
    // Placeholder (teams not yet defined) → not predictable → treat as locked.
    if (!match.homeTeam || !match.awayTeam) return true;
    return new Date(match.kickoffAt).getTime() <= now;
  }

  // Group / friendly: global apito-inicial lock.
  if (!tournamentStartsAt) return false;
  return new Date(tournamentStartsAt).getTime() <= now;
}
