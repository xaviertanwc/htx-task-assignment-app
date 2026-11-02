import { useId, useState } from 'react';
import type { Developer, Task, TaskStatus } from '../../../shared/api/types';
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog';
import { useToast } from '../../../shared/ui/Toast';
import { useUpdateTask } from '../api/taskQueries';
import {
  TASK_STATUSES,
  canMarkDone,
  isStatusAllowed,
  missingSkills,
  needsAssigneeToMoveForward,
  skillsPending,
  unassignWarning,
} from '../lib/taskRules';
import { subtaskProgress, type TaskVisibility } from '../lib/taskTree';

export interface TaskTreeView {
  developers: Developer[];
  /** Null when no filter is active, so everything shows. */
  visibility: TaskVisibility | null;
  collapsed: Set<number>;
  onToggle: (id: number) => void;
  highlightId: number | null;
}

interface TaskRowProps {
  task: Task;
  view: TaskTreeView;
  depth?: number;
  parentDone?: boolean;
}

function SkillsCell({ task }: { task: Task }) {
  if (skillsPending(task)) {
    return (
      <span className="skills-pending" title="Skills are identified automatically">
        Detecting skills…
      </span>
    );
  }
  return (
    <span>
      {task.skills.map((skill) => skill.name).join(', ')}
      {task.skillsSource === 'llm' && <span className="ai-tag">Auto-detected</span>}
    </span>
  );
}

function statusHint(task: Task, parentDone: boolean): string | undefined {
  if (parentDone) return 'Locked: reopen the parent task to change this.';
  if (needsAssigneeToMoveForward(task)) return 'Assign someone to move this task forward.';
  if (!canMarkDone(task)) return 'Done unlocks when all subtasks are Done.';
  return undefined;
}

/** Renders a task's row followed by the rows of its visible subtasks. */
export function TaskRow({ task, view, depth = 0, parentDone = false }: TaskRowProps) {
  const { developers, visibility, collapsed, onToggle, highlightId } = view;
  const update = useUpdateTask(task.id);
  const toast = useToast();
  const hintId = useId();
  const [confirmingUnassign, setConfirmingUnassign] = useState(false);

  const save = (change: Parameters<typeof update.mutate>[0], success: string) =>
    update.mutate(change, {
      onSuccess: () => toast('success', success),
      onError: (error) => toast('error', error.message),
    });

  const changeAssignee = (value: string) => {
    if (value === '' && unassignWarning(task)) {
      // The select stays on the current developer until the user confirms.
      setConfirmingUnassign(true);
      return;
    }
    save({ assigneeId: value === '' ? null : Number(value) }, 'Assignee updated.');
  };

  const progress = subtaskProgress(task);
  const warning = confirmingUnassign ? unassignWarning(task) : null;
  const hint = statusHint(task, parentDone);
  const pending = skillsPending(task);
  // While filtering, a matching subtask must not be hidden by a collapsed parent.
  const expanded = visibility !== null || !collapsed.has(task.id);
  const isContextOnly = visibility !== null && !visibility.matched.has(task.id);

  const rowClasses = [
    depth > 0 && 'subtask-row',
    isContextOnly && 'context-row',
    highlightId === task.id && 'highlight-row',
  ].filter(Boolean);

  return (
    <>
      <tr className={rowClasses.join(' ') || undefined}>
        <td className="cell-title" style={{ '--depth': depth } as React.CSSProperties}>
          <div className="title-layout">
            {progress.total > 0 ? (
              <button
                type="button"
                className="tree-toggle"
                aria-expanded={expanded}
                aria-label={`${expanded ? 'Collapse' : 'Expand'} subtasks of ${task.title}`}
                disabled={visibility !== null}
                onClick={() => onToggle(task.id)}
              >
                <span aria-hidden="true">{expanded ? '▾' : '▸'}</span>
              </button>
            ) : (
              <span className="tree-spacer" />
            )}
            <div>
              {depth > 0 && <span className="subtask-tag">Subtask</span>}
              <span>{task.title}</span>
              {progress.total > 0 && (
                <span className="progress">
                  {progress.done}/{progress.total} done
                </span>
              )}
            </div>
          </div>
        </td>
        <td className="cell-skills" data-label="Skills">
          <SkillsCell task={task} />
        </td>
        <td data-label="Status">
          <div>
            <select
              aria-label={`Status of ${task.title}`}
              aria-describedby={hint ? hintId : undefined}
              value={task.status}
              disabled={parentDone}
              onChange={(event) =>
                save({ status: event.target.value as TaskStatus }, 'Status updated.')
              }
            >
              {TASK_STATUSES.map((status) => (
                <option key={status} value={status} disabled={!isStatusAllowed(task, status)}>
                  {status}
                </option>
              ))}
            </select>
            {hint && (
              <p id={hintId} className="control-hint">
                {hint}
              </p>
            )}
          </div>
        </td>
        <td data-label="Assignee">
          <div>
            <select
              aria-label={`Assignee of ${task.title}`}
              value={task.assignee?.id ?? ''}
              disabled={pending}
              onChange={(event) => changeAssignee(event.target.value)}
            >
              <option value="">Unassigned</option>
              {developers.map((developer) => {
                const missing = missingSkills(task.skills, developer);
                return (
                  <option key={developer.id} value={developer.id} disabled={missing.length > 0}>
                    {missing.length > 0
                      ? `${developer.name} (missing ${missing.join(', ')})`
                      : developer.name}
                  </option>
                );
              })}
            </select>
            {pending && <p className="control-hint">Assignable once skills are detected.</p>}
            {warning && task.assignee && (
              <ConfirmDialog
                title={`Unassign ${task.assignee.name}?`}
                message={warning}
                confirmLabel="Unassign"
                cancelLabel={`Keep ${task.assignee.name}`}
                onConfirm={() => {
                  setConfirmingUnassign(false);
                  save({ assigneeId: null }, 'Assignee removed.');
                }}
                onCancel={() => setConfirmingUnassign(false)}
              />
            )}
          </div>
        </td>
      </tr>
      {expanded &&
        task.subtasks
          .filter((subtask) => visibility === null || visibility.visible.has(subtask.id))
          .map((subtask) => (
            <TaskRow
              key={subtask.id}
              task={subtask}
              view={view}
              depth={depth + 1}
              parentDone={task.status === 'Done'}
            />
          ))}
    </>
  );
}
