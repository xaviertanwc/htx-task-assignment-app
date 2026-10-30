import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCreateTask, useSkills } from '../api/queries';
import { ErrorBanner } from '../components/ErrorBanner';
import { TaskDraftEditor } from '../components/TaskDraftEditor';
import {
  addSubtask,
  findBlankTitles,
  newDraft,
  removeDraft,
  toNewTask,
  updateDraft,
} from '../lib/taskDraft';

export function TaskCreatePage() {
  const navigate = useNavigate();
  const skills = useSkills();
  const createTask = useCreateTask();
  const [draft, setDraft] = useState(newDraft);
  const [submitted, setSubmitted] = useState(false);

  const blankTitles = findBlankTitles(draft);
  const invalidKeys = submitted ? blankTitles : new Set<string>();

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (blankTitles.size > 0) return;
    createTask.mutate(toNewTask(draft), { onSuccess: () => navigate('/') });
  };

  return (
    <>
      <div className="page-header">
        <h1>Create Task(s)</h1>
        <Link to="/">Back to tasks</Link>
      </div>

      {skills.isPending && <p className="muted">Loading…</p>}
      {skills.isError && (
        <ErrorBanner message="Skills could not be loaded. Check that the backend is running, then refresh." />
      )}
      {skills.data && (
        <form onSubmit={handleSubmit} noValidate>
          <TaskDraftEditor
            draft={draft}
            number="1"
            skills={skills.data}
            invalidKeys={invalidKeys}
            disabled={createTask.isPending}
            onChange={(key, change) => setDraft((root) => updateDraft(root, key, change))}
            onAddSubtask={(key) => setDraft((root) => addSubtask(root, key))}
            onRemove={(key) => setDraft((root) => removeDraft(root, key))}
          />
          {createTask.isError && <ErrorBanner message={createTask.error.message} />}
          <div className="form-actions">
            {createTask.isPending && <span className="muted">Saving…</span>}
            <button type="submit" className="button-primary" disabled={createTask.isPending}>
              Save
            </button>
          </div>
        </form>
      )}
    </>
  );
}
