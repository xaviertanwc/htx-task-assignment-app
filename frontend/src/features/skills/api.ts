import { useQuery } from '@tanstack/react-query';
import { request } from '../../shared/api/http';
import type { Skill } from '../../shared/api/types';

export const useSkills = () =>
  useQuery({ queryKey: ['skills'], queryFn: () => request<Skill[]>('/skills') });
