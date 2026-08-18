import { describe, expect, it } from 'vitest';
import {
  isArchivedProject,
  isPublicProject,
  projectStatuses,
} from '../src/lib/projectStatus';

describe('project status visibility', () => {
  it('publishes only completed and ongoing projects on live routes', () => {
    expect(projectStatuses.filter(isPublicProject)).toEqual(['completed', 'ongoing']);
  });

  it('routes only archived projects through the archive', () => {
    expect(projectStatuses.filter(isArchivedProject)).toEqual(['archived']);
  });

  it('keeps planning and draft projects out of both route groups', () => {
    for (const status of ['planning', 'draft'] as const) {
      expect(isPublicProject(status)).toBe(false);
      expect(isArchivedProject(status)).toBe(false);
    }
  });
});
