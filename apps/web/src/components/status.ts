import type { AvailabilityStatus } from '@lmu/shared';

export const statusClass: Record<AvailabilityStatus, string> = {
  available: 'slot-available',
  maybe: 'slot-maybe',
  unavailable: 'slot-unavailable',
};

export const statusLabel: Record<AvailabilityStatus, string> = {
  available: 'Available',
  maybe: 'Maybe',
  unavailable: 'Not available',
};

export const slotClass = (s: AvailabilityStatus | null) => (s ? statusClass[s] : 'slot-empty');
