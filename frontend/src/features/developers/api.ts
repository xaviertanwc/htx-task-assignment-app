import { useQuery } from '@tanstack/react-query';
import { request } from '../../shared/api/http';
import type { Developer } from '../../shared/api/types';

export const DEVELOPERS_KEY = ['developers'];

export const useDevelopers = () =>
  useQuery({ queryKey: DEVELOPERS_KEY, queryFn: () => request<Developer[]>('/developers') });
