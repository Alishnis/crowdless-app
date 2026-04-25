import type { BusOccupancy } from '../types/bus.types';
import { MOCK_BUS } from './mockData';

const API_URL = import.meta.env.VITE_API_URL as string | undefined;

export async function getBuses(): Promise<BusOccupancy[]> {
  if (!API_URL) return [MOCK_BUS];
  const res = await fetch(`${API_URL}/buses`);
  return res.json();
}

export async function getBusById(id: string): Promise<BusOccupancy> {
  if (!API_URL) return { ...MOCK_BUS, busId: id };
  const res = await fetch(`${API_URL}/buses/${id}`);
  return res.json();
}
