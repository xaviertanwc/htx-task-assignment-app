import { useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { ErrorBanner } from '../../../shared/ui/ErrorBanner';
import { usePageTitle } from '../../../shared/ui/usePageTitle';
import { useDevelopers } from '../../developers/api';
import { useSkills } from '../../skills/api';
import { useTasks } from '../api/taskQueries';
import { SORT_LABELS, TaskFilterBar } from '../components/TaskFilterBar';
import { TaskRow, type TaskTreeView } from '../components/TaskRow';
import { TaskTableSkeleton } from '../components/TaskTableSkeleton';
import { TASK_STATUSES } from '../lib/taskRules';
import {
  findVisibleTasks,
  NO_FILTERS,
  isFiltering,
  sortTasks,
  type TaskFilters,
  type TaskSort,
} from '../lib/taskTree';
import type { CreatedTaskState } from './TaskCreatePage';

const DEFAULT_SORT: TaskSort = 'newest';

function readFilters(params: URLSearchParams): TaskFilters {
  const assignee = params.get('assignee');
  const skill = params.get('skill');
  return {
    search: params.get('search') ?? '',
    status: TASK_STATUSES.find((status) => status === params.get('status')) ?? '',
    skillId: skill ? Number(skill) : null,
    assignee: !assignee ? null : assignee === 'unassigned' ? assignee : Number(assignee),
  };
}

function readSort(params: URLSearchParams): TaskSort {
  const sort = params.get('sort');
  return sort && sort in SORT_LABELS ? (sort as TaskSort) : DEFAULT_SORT;
}

function writeParams(filters: TaskFilters, sort: TaskSort): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.status) params.set('status', filters.status);
  if (filters.skillId !== null) params.set('skill', String(filters.skillId));
  if (filters.assignee !== null) params.set('assignee', String(filters.assignee));
  if (sort !== DEFAULT_SORT) params.set('sort', sort);
  return params;
}

export function TaskListPage() {
  usePageTitle('Tasks');
  const tasks = useTasks();
  const developers = useDevelopers();
  const skills = useSkills();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  const filters = useMemo(() => readFilters(params), [params]);
  const sort = readSort(params);
  const filtering = isFiltering(filters);

  const visibility = useMemo(
    () => (filtering && tasks.data ? findVisibleTasks(tasks.data, filters) : null),
    [filtering, tasks.data, filters],
  );

  const roots = useMemo(() => {
    const visible = (tasks.data ?? []).filter(
      (task) => !visibility || visibility.visible.has(task.id),
    );
    return sortTasks(visible, sort);
  }, [tasks.data, visibility, sort]);

  const update = (nextFilters: TaskFilters, nextSort: TaskSort) =>
    // Replace, so each keystroke in search doesn't add a browser history entry.
    setParams(writeParams(nextFilters, nextSort), { replace: true, state: location.state });

  const toggle = (id: number) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const view: TaskTreeView = {
    developers: developers.data ?? [],
    visibility,
    collapsed,
    onToggle: toggle,
    highlightId: (location.state as CreatedTaskState | null)?.createdTaskId ?? null,
  };

  const isLoading = tasks.isPending || developers.isPending || skills.isPending;
  const failed = tasks.isError || developers.isError || skills.isError;
  const ready = tasks.data && developers.data && skills.data;

  return (
    <>
      <div className="page-header">
        <h1 tabIndex={-1}>Tasks</h1>
        <Link className="button button-primary" to="/tasks/new">
          Create Task
        </Link>
      </div>

      {isLoading && !failed && <TaskTableSkeleton />}
      {failed && (
        <ErrorBanner
          message="Tasks could not be loaded. Check that the backend is running."
          onRetry={() => {
            void tasks.refetch();
            void developers.refetch();
            void skills.refetch();
          }}
        />
      )}
      {ready && tasks.data.length === 0 && (
        <p className="empty">
          No tasks yet. <Link to="/tasks/new">Create the first one.</Link>
        </p>
      )}
      {ready && tasks.data.length > 0 && (
        <>
          <TaskFilterBar
            filters={filters}
            sort={sort}
            skills={skills.data}
            developers={developers.data}
            onFiltersChange={(next) => update(next, sort)}
            onSortChange={(next) => update(filters, next)}
          />
          {roots.length === 0 ? (
            <div className="empty">
              <p>No tasks match these filters.</p>
              <button type="button" onClick={() => update(NO_FILTERS, sort)}>
                Clear filters
              </button>
            </div>
          ) : (
            <table className="task-table">
              <thead>
                <tr>
                  <th scope="col">Task Title</th>
                  <th scope="col">Skills</th>
                  <th scope="col">Status</th>
                  <th scope="col">Assignee</th>
                </tr>
              </thead>
              <tbody>
                {roots.map((task) => (
                  <TaskRow key={task.id} task={task} view={view} />
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </>
  );
}
