import type { OccupancyLevel } from '../types/bus.types';

export function getOccupancyLevel(percentage: number): OccupancyLevel {
  if (percentage <= 40) return 'low';
  if (percentage <= 70) return 'medium';
  return 'high';
}

export const OCCUPANCY_COLORS: Record<OccupancyLevel, string> = {
  low:    '#22c55e',
  medium: '#eab308',
  high:   '#ef4444',
};

export const OCCUPANCY_LABELS: Record<OccupancyLevel, string> = {
  low:    'Свободно',
  medium: 'Заполнен',
  high:   'Переполнен',
};
