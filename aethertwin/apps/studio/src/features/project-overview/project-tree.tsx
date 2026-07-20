import type { ProjectSnapshot } from "@aethertwin/core-model";

export interface ProjectTreeProps {
  snapshot: ProjectSnapshot;
}

export function ProjectTree({ snapshot }: ProjectTreeProps) {
  return (
    <div className="studio-project-tree">
      <h2>项目树</h2>
      <ul>
        <li>
          <strong>{snapshot.project.name}</strong>
          <ul>
            {snapshot.project.floors.map((floor) => (
              <li key={floor.id}>{floor.name}</li>
            ))}
          </ul>
        </li>
      </ul>
    </div>
  );
}
