import type { Skill } from '../../../shared/api/types';

interface SkillChipsProps {
  skills: Skill[];
  selectedIds: number[];
  label: string;
  onToggle: (skillId: number) => void;
}

/** Checkboxes styled as chips, which keeps native keyboard and screen reader behaviour. */
export function SkillChips({ skills, selectedIds, label, onToggle }: SkillChipsProps) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {skills.map((skill) => (
        <label key={skill.id} className="chip">
          <input
            type="checkbox"
            checked={selectedIds.includes(skill.id)}
            onChange={() => onToggle(skill.id)}
          />
          <span>{skill.name}</span>
        </label>
      ))}
    </div>
  );
}
