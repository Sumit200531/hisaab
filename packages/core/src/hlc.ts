/**
 * Hybrid logical clock.
 *
 * Phone clocks in the real world are often wrong by minutes or days. An HLC
 * timestamp follows wall-clock time when clocks agree, but never goes backwards
 * and always orders an event after anything its device has already seen, so
 * "last write wins" picks the edit the user actually made last.
 *
 * Encoded timestamps sort lexicographically in time order, which makes them
 * usable directly as operation ids.
 */
export interface Clock { wall: number; counter: number; node: string }

/** Remote clocks further ahead than this are not allowed to drag ours forward. */
export const MAX_DRIFT_MS = 24 * 60 * 60 * 1000;

export const NODE_RE = /^[a-z0-9]{4,16}$/;

export function zero(node: string): Clock {
  if (!NODE_RE.test(node)) throw new Error(`invalid device id ${node}`);
  return { wall: 0, counter: 0, node };
}

/** A local event: advance to the later of our clock and the wall clock. */
export function tick(c: Clock, now: number): Clock {
  if (now > c.wall) return { wall: now, counter: 0, node: c.node };
  return { wall: c.wall, counter: c.counter + 1, node: c.node };
}

/** Receiving a remote timestamp: move past it so our next event sorts after it. */
export function receive(c: Clock, remote: Clock, now: number): Clock {
  if (remote.wall > now + MAX_DRIFT_MS) return c;   // a phone set to the wrong year must not poison everyone
  const wall = Math.max(c.wall, remote.wall, now);
  let counter: number;
  if (wall === c.wall && wall === remote.wall) counter = Math.max(c.counter, remote.counter) + 1;
  else if (wall === c.wall) counter = c.counter + 1;
  else if (wall === remote.wall) counter = remote.counter + 1;
  else counter = 0;
  return { wall, counter, node: c.node };
}

export function encode(c: Clock): string {
  return `${c.wall.toString(36).padStart(9, '0')}.${c.counter.toString(36).padStart(4, '0')}.${c.node}`;
}

export function decode(s: string): Clock | null {
  const m = /^([0-9a-z]{9})\.([0-9a-z]{4})\.([a-z0-9]{4,16})$/.exec(s);
  if (!m) return null;
  return { wall: parseInt(m[1], 36), counter: parseInt(m[2], 36), node: m[3] };
}
