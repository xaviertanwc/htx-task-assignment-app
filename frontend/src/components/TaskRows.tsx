import { useUpdateTask } from '../api/queries';
import { TASK_STATUSES, type Developer, type Task, type TaskStatus } from '../api/types';
import { canMarkDone, eligibleDevelopers } from '../lib/taskRules';

interface TaskRowsProps {
  task: Task;
  developers: Developer[];
  depth?: number;
  parentDone?: boolean;
}

/** Renders a task's row followed by the rows of all its subtasks, indented by depth. */
export function TaskRows({ task, developers, depth = 0, parentDone = false }: TaskRowsProps) {
  const update = useUpdateTask(task.id);
  const doneAllowed = canMarkDone(task);
  const eligible = eligibleDevelopers(task, developers);
  const label = task.title;

  return (
    <>
      <tr className={depth > 0 ? 'subtask-row' : undefined}>
        <td className="cell-title" style={{ '--depth': depth } as React.CSSProperties}>
          {depth > 0 && <span className="subtask-tag">Subtask</span>}
          {task.title}
          {update.isError && (
            <p className="row-error" role="alert">
              {update.error.message}
            </p>
          )}
        </td>
        <td className="cell-skills" data-label="Skills">
          <span>
            {task.skills.map((skill) => skill.name).join(', ')}
            {task.skillsSource === 'llm' && (
              <span className="ai-tag" title="Identified automatically from the task title">
                AI
              </span>
            )}
          </span>
        </td>
        <td data-label="Status">
          <select
            aria-label={`Status of ${label}`}
            value={task.status}
            disabled={update.isPending || parentDone}
            title={parentDone ? 'The parent task is Done. Reopen it to change this.' : undefined}
            onChange={(event) => update.mutate({ status: event.target.value as TaskStatus })}
          >
            {TASK_STATUSES.map((status) => {
              const blocked = status === 'Done' && !doneAllowed;
              return (
                <option key={status} value={status} disabled={blocked}>
                  {blocked ? 'Done (finish subtasks first)' : status}
                </option>
              );
            })}
          </select>
        </td>
        <td data-label="Assignee">
          <select
            aria-label={`Assignee of ${label}`}
            value={task.assignee?.id ?? ''}
            disabled={update.isPending}
            onChange={(event) =>
              update.mutate({
                assigneeId: event.target.value === '' ? null : Number(event.target.value),
              })
            }
          >
            <option value="">Unassigned</option>
            {eligible.map((developer) => (
              <option key={developer.id} value={developer.id}>
                {developer.name}
              </option>
            ))}
          </select>
        </td>
      </tr>
      {task.subtasks.map((subtask) => (
        <TaskRows
          key={subtask.id}
          task={subtask}
          developers={developers}
          depth={depth + 1}
          parentDone={task.status === 'Done'}
        />
      ))}
    </>
  );
}
