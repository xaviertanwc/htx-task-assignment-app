import type { Developer, Skill, TaskStatus } from '../../../shared/api/types';
import { TASK_STATUSES } from '../lib/taskRules';
import { type TaskFilters, type TaskSort } from '../lib/taskTree';

export const SORT_LABELS: Record<TaskSort, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  title: 'Title A–Z',
  status: 'Status',
};

interface TaskFilterBarProps {
  filters: TaskFilters;
  sort: TaskSort;
  skills: Skill[];
  developers: Developer[];
  onFiltersChange: (filters: TaskFilters) => void;
  onSortChange: (sort: TaskSort) => void;
}

export function TaskFilterBar(props: TaskFilterBarProps) {
  const { filters, sort, skills, developers, onFiltersChange, onSortChange } = props;
  const set = (change: Partial<TaskFilters>) => onFiltersChange({ ...filters, ...change });

  return (
    <form
      className="filter-bar"
      role="search"
      aria-label="Filter tasks"
      onSubmit={(event) => event.preventDefault()}
    >
      <label className="filter filter-search">
        <span>Search</span>
        <input
          type="search"
          value={filters.search}
          placeholder="Search titles"
          onChange={(event) => set({ search: event.target.value })}
        />
      </label>
      <label className="filter">
        <span>Status</span>
        <select
          value={filters.status}
          onChange={(event) => set({ status: event.target.value as TaskStatus | '' })}
        >
          <option value="">All</option>
          {TASK_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </label>
      <label className="filter">
        <span>Skill</span>
        <select
          value={filters.skillId ?? ''}
          onChange={(event) =>
            set({ skillId: event.target.value === '' ? null : Number(event.target.value) })
          }
        >
          <option value="">All</option>
          {skills.map((skill) => (
            <option key={skill.id} value={skill.id}>
              {skill.name}
            </option>
          ))}
        </select>
      </label>
      <label className="filter">
        <span>Assignee</span>
        <select
          value={filters.assignee ?? ''}
          onChange={(event) => {
            const { value } = event.target;
            set({
              assignee: value === '' ? null : value === 'unassigned' ? value : Number(value),
            });
          }}
        >
          <option value="">All</option>
          <option value="unassigned">Unassigned</option>
          {developers.map((developer) => (
            <option key={developer.id} value={developer.id}>
              {developer.name}
            </option>
          ))}
        </select>
      </label>
      <label className="filter">
        <span>Sort by</span>
        <select value={sort} onChange={(event) => onSortChange(event.target.value as TaskSort)}>
          {Object.entries(SORT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
    </form>
  );
}
