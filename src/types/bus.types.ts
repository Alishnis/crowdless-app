export type OccupancyLevel = 'low' | 'medium' | 'high';

export interface BusOccupancy {
  busId: string;
  routeNumber: string;
  count: number;
  capacity: number;
  percentage: number;
  updatedAt: string;
  coordinates: [number, number];
}

export interface RoutePoint {
  coordinates: [number, number];
}
