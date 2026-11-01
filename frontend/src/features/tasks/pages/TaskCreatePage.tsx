import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useBlocker, useNavigate } from 'react-router-dom';
import type { Task } from '../../../shared/api/types';
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog';
import { ErrorBanner } from '../../../shared/ui/ErrorBanner';
import { useToast } from '../../../shared/ui/Toast';
import { usePageTitle } from '../../../shared/ui/usePageTitle';
import { useSkills } from '../../skills/api';
import { useCreateTask } from '../api/taskQueries';
import {
  addSubtaskButtonId,
  TaskDraftEditor,
  titleInputId,
  type DraftEditorActions,
} from '../components/TaskDraftEditor';
import {
  appendSubtask,
  countDescendants,
  findBlankTitles,
  isPristine,
  newDraft,
  removeDraft,
  toTaskInput,
  updateDraft,
  type TaskDraft,
} from '../lib/taskDraft';
import { countBySkillsSource } from '../lib/taskTree';

export interface CreatedTaskState {
  createdTaskId: number;
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

function describeCreated(task: Task): { tone: 'success' | 'info'; message: string } {
  const pending = countBySkillsSource(task, 'pending');
  if (pending > 0) {
    return {
      tone: 'info',
      message: `Task created. Skills for ${plural(pending, 'task')} couldn't be detected yet and will be retried automatically.`,
    };
  }
  const detected = countBySkillsSource(task, 'llm');
  return {
    tone: 'success',
    message:
      detected > 0
        ? `Task created. Skills were auto-detected for ${plural(detected, 'task')}.`
        : 'Task created.',
  };
}

interface PendingRemoval {
  draft: TaskDraft;
  number: string;
  parentKey: string;
}

export function TaskCreatePage() {
  usePageTitle('Create Task');
  const navigate = useNavigate();
  const toast = useToast();
  const skills = useSkills();
  const createTask = useCreateTask();
  const [draft, setDraft] = useState(newDraft);
  const [submitted, setSubmitted] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);

  // A ref rather than state: it must take effect for the navigation made in the same tick.
  const saved = useRef(false);
  const dirty = !isPristine(draft);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !saved.current && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (!saved.current) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => {
    if (!focusKey) return;
    document.getElementById(titleInputId(focusKey))?.focus();
    setFocusKey(null);
  }, [focusKey]);

  const blankTitles = findBlankTitles(draft);
  const invalidKeys = new Set(submitted ? blankTitles : []);

  const applyRemoval = ({
    draft: removed,
    parentKey,
  }: Pick<PendingRemoval, 'draft' | 'parentKey'>) => {
    setDraft((root) => removeDraft(root, removed.key));
    // The removed button no longer exists, so focus must move somewhere sensible.
    document.getElementById(addSubtaskButtonId(parentKey))?.focus();
  };

  const actions: DraftEditorActions = {
    change: (key, change) => setDraft((root) => updateDraft(root, key, change)),
    addSubtask: (parentKey) => {
      const subtask = newDraft();
      setDraft((root) => appendSubtask(root, parentKey, subtask));
      setFocusKey(subtask.key);
    },
    remove: (removed, number, parentKey) => {
      // Only a removal that takes nested work with it is worth interrupting for.
      if (removed.subtasks.length > 0) setPendingRemoval({ draft: removed, number, parentKey });
      else applyRemoval({ draft: removed, parentKey });
    },
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    const [firstBlank] = blankTitles;
    if (firstBlank) {
      setFocusKey(firstBlank);
      return;
    }
    createTask.mutate(toTaskInput(draft), {
      onSuccess: (task) => {
        saved.current = true;
        const { tone, message } = describeCreated(task);
        toast(tone, message);
        const state: CreatedTaskState = { createdTaskId: task.id };
        navigate('/', { state });
      },
    });
  };

  return (
    <>
      <div className="page-header">
        <h1 tabIndex={-1}>Create Task(s)</h1>
        <Link to="/">Back to tasks</Link>
      </div>

      {skills.isPending && (
        <div className="skeleton skeleton-form" role="status" aria-label="Loading" />
      )}
      {skills.isError && (
        <ErrorBanner
          message="Skills could not be loaded. Check that the backend is running."
          onRetry={() => void skills.refetch()}
        />
      )}
      {skills.data && (
        <form onSubmit={handleSubmit} noValidate>
          <TaskDraftEditor
            draft={draft}
            number="1"
            skills={skills.data}
            invalidKeys={invalidKeys}
            disabled={createTask.isPending}
            actions={actions}
          />
          {createTask.isError && <ErrorBanner message={createTask.error.message} />}
          <div className="form-actions">
            {createTask.isPending && (
              <span className="muted" role="status">
                Saving…
              </span>
            )}
            <button type="submit" className="button-primary" disabled={createTask.isPending}>
              Save
            </button>
          </div>
        </form>
      )}

      {blocker.state === 'blocked' && (
        <ConfirmDialog
          title="Discard this task?"
          message="You have unsaved changes that will be lost if you leave this page."
          confirmLabel="Discard"
          cancelLabel="Keep editing"
          onConfirm={() => blocker.proceed()}
          onCancel={() => blocker.reset()}
        />
      )}
      {pendingRemoval && (
        <ConfirmDialog
          title={`Remove subtask ${pendingRemoval.number}?`}
          message={`This also removes ${plural(countDescendants(pendingRemoval.draft), 'nested subtask')}.`}
          confirmLabel="Remove"
          cancelLabel="Keep"
          onConfirm={() => {
            applyRemoval(pendingRemoval);
            setPendingRemoval(null);
          }}
          onCancel={() => setPendingRemoval(null)}
        />
      )}
    </>
  );
}
