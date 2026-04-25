import type { BusOccupancy, RoutePoint } from '../types/bus.types';

export const MOCK_ROUTE_POINTS: RoutePoint[] = [
  { coordinates: [76.8893, 43.2565] },
  { coordinates: [76.8921, 43.2578] },
  { coordinates: [76.8954, 43.2590] },
  { coordinates: [76.8987, 43.2601] },
  { coordinates: [76.9020, 43.2615] },
  { coordinates: [76.9055, 43.2628] },
  { coordinates: [76.9088, 43.2640] },
  { coordinates: [76.9120, 43.2652] },
  { coordinates: [76.9150, 43.2660] },
  { coordinates: [76.9178, 43.2668] },
  { coordinates: [76.9205, 43.2675] },
  { coordinates: [76.9230, 43.2680] },
  { coordinates: [76.9255, 43.2685] },
  { coordinates: [76.9278, 43.2688] },
  { coordinates: [76.9300, 43.2690] },
  { coordinates: [76.9278, 43.2695] },
  { coordinates: [76.9250, 43.2700] },
  { coordinates: [76.9220, 43.2705] },
  { coordinates: [76.9190, 43.2698] },
  { coordinates: [76.9160, 43.2688] },
];

export const MOCK_BUS: BusOccupancy = {
  busId: 'bus-001',
  routeNumber: '37А',
  count: 48,
  capacity: 65,
  percentage: 74,
  updatedAt: new Date().toISOString(),
  coordinates: MOCK_ROUTE_POINTS[0].coordinates,
};
