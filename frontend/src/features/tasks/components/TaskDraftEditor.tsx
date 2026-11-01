import type { Skill } from '../../../shared/api/types';
import { MAX_DEPTH, type TaskDraft } from '../lib/taskDraft';
import { SkillChips } from './SkillChips';

export const titleInputId = (key: string) => `title-${key}`;
export const addSubtaskButtonId = (key: string) => `add-subtask-${key}`;

export interface DraftEditorActions {
  change: (key: string, change: (node: TaskDraft) => TaskDraft) => void;
  addSubtask: (parentKey: string) => void;
  remove: (draft: TaskDraft, number: string, parentKey: string) => void;
}

interface TaskDraftEditorProps {
  draft: TaskDraft;
  number: string;
  parentKey?: string;
  depth?: number;
  skills: Skill[];
  invalidKeys: Set<string>;
  disabled: boolean;
  actions: DraftEditorActions;
}

/** One task's fields, followed recursively by an editor for each of its subtasks. */
export function TaskDraftEditor(props: TaskDraftEditorProps) {
  const { draft, number, parentKey, depth = 0, skills, invalidKeys, disabled, actions } = props;
  const titleId = titleInputId(draft.key);
  const invalid = invalidKeys.has(draft.key);
  const heading = `${depth === 0 ? 'Task' : 'Subtask'} ${number}`;

  const toggleSkill = (skillId: number) =>
    actions.change(draft.key, (node) => ({
      ...node,
      skillIds: node.skillIds.includes(skillId)
        ? node.skillIds.filter((id) => id !== skillId)
        : [...node.skillIds, skillId],
    }));

  return (
    <div className="draft-branch">
      <fieldset className="draft" disabled={disabled}>
        <legend className="draft-number">{heading}</legend>
        <label htmlFor={titleId}>
          Title <span aria-hidden="true">*</span>
        </label>
        <textarea
          id={titleId}
          rows={2}
          maxLength={500}
          required
          value={draft.title}
          aria-invalid={invalid}
          aria-describedby={invalid ? `${titleId}-error` : undefined}
          placeholder="As a user, I want to…"
          onChange={(event) =>
            actions.change(draft.key, (node) => ({ ...node, title: event.target.value }))
          }
        />
        {invalid && (
          <p className="field-error" id={`${titleId}-error`}>
            Enter a title.
          </p>
        )}

        <div className="draft-footer">
          <div className="skills-field">
            <span className="skills-label">Skills</span>
            <SkillChips
              skills={skills}
              selectedIds={draft.skillIds}
              label={`Skills for ${heading}`}
              onToggle={toggleSkill}
            />
            {draft.skillIds.length === 0 && (
              <span className="hint">Leave empty to detect skills automatically with AI.</span>
            )}
          </div>
          <div className="draft-actions">
            {parentKey !== undefined && (
              <button
                type="button"
                className="button-quiet"
                aria-label={`Remove ${heading}`}
                onClick={() => actions.remove(draft, number, parentKey)}
              >
                Remove
              </button>
            )}
            {depth + 1 < MAX_DEPTH && (
              <button
                type="button"
                id={addSubtaskButtonId(draft.key)}
                aria-label={`Add subtask to ${heading}`}
                onClick={() => actions.addSubtask(draft.key)}
              >
                Add Subtask
              </button>
            )}
          </div>
        </div>
      </fieldset>

      {draft.subtasks.length > 0 && (
        <div className="draft-children">
          {draft.subtasks.map((subtask, index) => (
            <TaskDraftEditor
              {...props}
              key={subtask.key}
              draft={subtask}
              number={`${number}.${index + 1}`}
              parentKey={draft.key}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
