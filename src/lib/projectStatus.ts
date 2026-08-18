export const projectStatuses = [
  'completed',
  'ongoing',
  'planning',
  'draft',
  'archived',
] as const;

export type ProjectStatus = (typeof projectStatuses)[number];

export function isPublicProject(status: ProjectStatus): boolean {
  return status === 'completed' || status === 'ongoing';
}

export function isArchivedProject(status: ProjectStatus): boolean {
  return status === 'archived';
}
