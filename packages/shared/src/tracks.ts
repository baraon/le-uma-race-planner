/**
 * Built-in endurance circuits. Every number here is only a starting default (CLAUDE.md rule 6):
 * the event form pre-fills from it and the organiser can change anything per event.
 */

export interface TrackDefaults {
  name: string;
  /** IANA zone for "track time". */
  timezone: string;
  /** Seconds lost driving through the pit lane versus staying out (starting estimate). */
  pitLaneLossSeconds: number;
}

export const TRACKS: readonly TrackDefaults[] = [
  { name: 'Circuit de la Sarthe (Le Mans)', timezone: 'Europe/Paris', pitLaneLossSeconds: 31 },
  { name: 'Spa-Francorchamps', timezone: 'Europe/Brussels', pitLaneLossSeconds: 21 },
  {
    name: 'Spa-Francorchamps (endurance pit lane)',
    timezone: 'Europe/Brussels',
    pitLaneLossSeconds: 53,
  },
  { name: 'Sebring International Raceway', timezone: 'America/New_York', pitLaneLossSeconds: 32 },
  { name: 'Autodromo Nazionale Monza', timezone: 'Europe/Rome', pitLaneLossSeconds: 28 },
  {
    name: 'Autodromo Enzo e Dino Ferrari (Imola)',
    timezone: 'Europe/Rome',
    pitLaneLossSeconds: 34,
  },
  { name: 'Fuji Speedway', timezone: 'Asia/Tokyo', pitLaneLossSeconds: 33 },
  { name: 'Bahrain International Circuit', timezone: 'Asia/Bahrain', pitLaneLossSeconds: 27 },
  { name: 'Lusail International Circuit (Qatar)', timezone: 'Asia/Qatar', pitLaneLossSeconds: 28 },
  {
    name: 'Algarve International Circuit (Portimão)',
    timezone: 'Europe/Lisbon',
    pitLaneLossSeconds: 31,
  },
  {
    name: 'Autódromo José Carlos Pace (Interlagos)',
    timezone: 'America/Sao_Paulo',
    pitLaneLossSeconds: 27,
  },
  { name: 'Circuit of the Americas', timezone: 'America/Chicago', pitLaneLossSeconds: 23 },
  { name: 'Silverstone Circuit', timezone: 'Europe/London', pitLaneLossSeconds: 23 },
  { name: 'Circuit Paul Ricard', timezone: 'Europe/Paris', pitLaneLossSeconds: 23 },
  { name: 'Circuit de Barcelona-Catalunya', timezone: 'Europe/Madrid', pitLaneLossSeconds: 23 },
];

/** Case- and space-insensitive key, so "le mans " and "Le Mans" share pace profiles. */
export function trackKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function findTrack(name: string | null | undefined): TrackDefaults | undefined {
  if (!name) return undefined;
  const key = trackKey(name);
  return TRACKS.find((t) => trackKey(t.name) === key);
}

/** How a class measures what's in the tank: energy % or litres of fuel (a default, editable). */
export const FUEL_UNITS = ['percent', 'litres'] as const;
export type FuelUnit = (typeof FUEL_UNITS)[number];

export const CAR_CLASSES: readonly { name: string; fuelUnit: FuelUnit }[] = [
  { name: 'Hypercar', fuelUnit: 'percent' },
  { name: 'LMGT3', fuelUnit: 'percent' },
  { name: 'LMP2', fuelUnit: 'litres' },
  { name: 'LMP3', fuelUnit: 'litres' },
  { name: 'GTE', fuelUnit: 'litres' },
];

/** Starting defaults for a new event's strategy settings. */
export const STRATEGY_DEFAULTS = {
  fuelUnit: 'percent' as FuelUnit,
  fuelCapacity: 100,
  refuelSeconds: 60,
  pitLaneLossSeconds: 30,
};
