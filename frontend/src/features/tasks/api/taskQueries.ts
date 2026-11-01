import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { request } from '../../../shared/api/http';
import type { Developer, Task, TaskInput, TaskUpdate } from '../../../shared/api/types';
import { DEVELOPERS_KEY } from '../../developers/api';
import { applyUpdate, hasPendingSkills } from '../lib/taskTree';

const TASKS_KEY = ['tasks'];
const PENDING_POLL_MS = 5_000;

export const useTasks = () =>
  useQuery({
    queryKey: TASKS_KEY,
    queryFn: () => request<Task[]>('/tasks'),
    // Pending skills are resolved by a background job, so only then is polling worthwhile.
    refetchInterval: (query) =>
      query.state.data && hasPendingSkills(query.state.data) ? PENDING_POLL_MS : false,
  });

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (task: TaskInput) =>
      request<Task>('/tasks', { method: 'POST', body: JSON.stringify(task) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TASKS_KEY }),
  });
}

export function useUpdateTask(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    // Same scope means quick successive edits to one task reach the server in order.
    scope: { id: `task-${id}` },
    mutationFn: (update: TaskUpdate) =>
      request<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(update) }),
    onMutate: async (update) => {
      await queryClient.cancelQueries({ queryKey: TASKS_KEY });
      const previous = queryClient.getQueryData<Task[]>(TASKS_KEY);
      const developers = queryClient.getQueryData<Developer[]>(DEVELOPERS_KEY) ?? [];
      if (previous) {
        queryClient.setQueryData(TASKS_KEY, applyUpdate(previous, id, update, developers));
      }
      return { previous };
    },
    onError: (_error, _update, context) => {
      queryClient.setQueryData(TASKS_KEY, context?.previous);
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: TASKS_KEY }),
        queryClient.invalidateQueries({ queryKey: DEVELOPERS_KEY }),
      ]),
  });
}
