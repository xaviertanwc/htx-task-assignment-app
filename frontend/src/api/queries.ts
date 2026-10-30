import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { NewTask, TaskUpdate } from './types';

export const useTasks = () => useQuery({ queryKey: ['tasks'], queryFn: api.listTasks });
export const useDevelopers = () =>
  useQuery({ queryKey: ['developers'], queryFn: api.listDevelopers });
export const useSkills = () => useQuery({ queryKey: ['skills'], queryFn: api.listSkills });

export function useUpdateTask(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (update: TaskUpdate) => api.updateTask(id, update),
    // Returning the promise keeps the mutation pending until the list shows the new value.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (task: NewTask) => api.createTask(task),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });
}
