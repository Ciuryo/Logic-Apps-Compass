import { describe, expect, it } from 'vitest';
import { knowledgeDocuments } from '@/content/knowledge';
import { lessons } from '@/content/lessons';
import { educationalTemplates } from '@/content/templates';

describe('local educational content', () => {
  it('provides 18 distinct dated official references', () => {
    expect(knowledgeDocuments).toHaveLength(18);
    expect(new Set(knowledgeDocuments.map(document => document.id)).size).toBe(18);
    for (const document of knowledgeDocuments) {
      expect(document.officialSource).toBe(true);
      expect(document.sourceUrl).toMatch(/^https:\/\/learn\.microsoft\.com\//);
      expect(document.lastVerifiedAt).toBe('2026-10-06');
      expect(document.summary.length).toBeGreaterThan(40);
    }
  });
  it('gives all 13 lessons actionable exercises and explained answers', () => {
    expect(lessons).toHaveLength(13);
    for (const lesson of lessons) {
      expect(lesson.objective.length).toBeGreaterThan(20);
      expect(lesson.explanation.length).toBeGreaterThan(60);
      expect(lesson.exercise.length).toBeGreaterThan(20);
      expect(lesson.commentedAnswer.length).toBeGreaterThan(40);
      expect(lesson.officialLinks.length).toBeGreaterThan(0);
    }
  });
  it('offers eight JSON workflows with scenarios and failure simulations', () => {
    expect(educationalTemplates).toHaveLength(8);
    for (const template of educationalTemplates) {
      const parsed: unknown = JSON.parse(template.json);
      expect(parsed).toHaveProperty('definition.triggers');
      expect(parsed).toHaveProperty('definition.actions');
      expect(template.diagram.length).toBeGreaterThan(1);
      expect(template.security.length).toBeGreaterThan(0);
      expect(template.testing.length).toBeGreaterThan(0);
      expect(template.simulatedFailures.length).toBeGreaterThan(1);
    }
  });
});
