import type { Skill } from '../api/types';
import { MAX_DEPTH, type TaskDraft } from '../lib/taskDraft';

interface TaskDraftEditorProps {
  draft: TaskDraft;
  number: string;
  depth?: number;
  skills: Skill[];
  invalidKeys: Set<string>;
  disabled: boolean;
  onChange: (key: string, change: (node: TaskDraft) => TaskDraft) => void;
  onAddSubtask: (parentKey: string) => void;
  onRemove: (key: string) => void;
}

/** One task's fields, followed recursively by an editor for each of its subtasks. */
export function TaskDraftEditor(props: TaskDraftEditorProps) {
  const { draft, number, depth = 0, skills, invalidKeys, disabled } = props;
  const { onChange, onAddSubtask, onRemove } = props;
  const titleId = `title-${draft.key}`;
  const invalid = invalidKeys.has(draft.key);

  const toggleSkill = (skillId: number) =>
    onChange(draft.key, (node) => ({
      ...node,
      skillIds: node.skillIds.includes(skillId)
        ? node.skillIds.filter((id) => id !== skillId)
        : [...node.skillIds, skillId],
    }));

  return (
    <div className="draft-branch">
      <fieldset className="draft" disabled={disabled}>
        <legend className="draft-number">
          {depth === 0 ? 'Task' : 'Subtask'} {number}
        </legend>
        <label htmlFor={titleId}>Title</label>
        <textarea
          id={titleId}
          rows={2}
          maxLength={500}
          value={draft.title}
          aria-invalid={invalid}
          aria-describedby={invalid ? `${titleId}-error` : undefined}
          placeholder="As a user, I want to…"
          onChange={(event) =>
            onChange(draft.key, (node) => ({ ...node, title: event.target.value }))
          }
        />
        {invalid && (
          <p className="field-error" id={`${titleId}-error`}>
            Enter a title.
          </p>
        )}

        <div className="draft-footer">
          <div className="skills-field" role="group" aria-label={`Skills for ${number}`}>
            <span className="skills-label">Skills</span>
            {skills.map((skill) => (
              <label key={skill.id} className="checkbox">
                <input
                  type="checkbox"
                  checked={draft.skillIds.includes(skill.id)}
                  onChange={() => toggleSkill(skill.id)}
                />
                {skill.name}
              </label>
            ))}
            {draft.skillIds.length === 0 && <span className="hint">AI will identify these</span>}
          </div>
          <div className="draft-actions">
            {depth > 0 && (
              <button type="button" className="button-quiet" onClick={() => onRemove(draft.key)}>
                Remove
              </button>
            )}
            {depth + 1 < MAX_DEPTH && (
              <button type="button" onClick={() => onAddSubtask(draft.key)}>
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
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
