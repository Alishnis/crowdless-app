export type OccupancyLevel = 'low' | 'medium' | 'high';

export interface BusOccupancy {
  busId: string;
  routeNumber: string;
  routeName?: string;
  count: number;
  capacity: number;
  percentage: number;
  inCount?: number;
  outCount?: number;
  updatedAt: string;
  coordinates: [number, number];
}

export interface RoutePoint {
  coordinates: [number, number];
}

export interface Stop {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface SimulatedBus {
  busId: string;
  routeId: string;
  routeNumber: string;
  routeName: string;
  color: string;
  pos: { lat: number; lng: number };
  heading: number;
  count: number;
  capacity: number;
  percentage: number;
  nextStop: string;
  inCount: number;
  outCount: number;
}
