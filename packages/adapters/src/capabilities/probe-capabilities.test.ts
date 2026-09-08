import { describe, expect, it } from 'vitest';

import { probeCapabilities } from './probe-capabilities';

describe('probeCapabilities', () => {
  it('returns all false when source is undefined or empty', () => {
    expect(probeCapabilities()).toEqual({
      observationalMemory: false,
      memoryExtractors: false,
      skills: false,
      skillSearch: false,
      versionedSkills: false,
      feedback: false,
      datasets: false,
      experiments: false,
      toolHooks: false,
      dynamicWorkflows: false,
      fineGrainedAuthorization: false,
    });
    expect(probeCapabilities({})).toMatchObject({ memoryExtractors: false, experiments: false });
    expect(probeCapabilities({}).memoryExtractors).toBe(false);
  });

  it('detects observational memory and extractors by duck typing', () => {
    class Memory {}
    class Extractor {}
    expect(probeCapabilities({ Memory, observationalMemory: true }).observationalMemory).toBe(true);
    expect(probeCapabilities({ Extractor }).memoryExtractors).toBe(true);
    expect(
      probeCapabilities({
        observationalMemory: { extract: () => undefined },
      }).memoryExtractors,
    ).toBe(true);
    expect(probeCapabilities({ onExtracted: () => undefined }).memoryExtractors).toBe(true);
    expect(probeCapabilities(new Memory()).observationalMemory).toBe(true);
  });

  it('detects skills, search, versioned sources, datasets, and experiments', () => {
    expect(probeCapabilities({ createSkill: () => undefined }).skills).toBe(true);
    expect(probeCapabilities({ skills: [] }).skills).toBe(true);
    expect(
      probeCapabilities({ SkillSearchProcessor: class SkillSearchProcessor {} }).skillSearch,
    ).toBe(true);
    expect(
      probeCapabilities({ CompositeVersionedSkillSource: class CompositeVersionedSkillSource {} })
        .versionedSkills,
    ).toBe(true);
    expect(
      probeCapabilities({ VersionedSkillSource: class VersionedSkillSource {} }).versionedSkills,
    ).toBe(true);
    expect(probeCapabilities({ datasets: {}, addItem: () => undefined }).datasets).toBe(true);
    expect(probeCapabilities({ startExperiment: () => undefined }).experiments).toBe(true);
    expect(probeCapabilities({ compareExperiments: () => undefined }).experiments).toBe(true);
  });

  it('detects hooks, workflows, feedback, and authorization surfaces', () => {
    expect(probeCapabilities({ hooks: { afterToolCall: () => undefined } }).toolHooks).toBe(true);
    expect(probeCapabilities({ afterToolCall: () => undefined }).toolHooks).toBe(true);
    expect(probeCapabilities({ addDynamicWorkflow: () => undefined }).dynamicWorkflows).toBe(true);
    expect(probeCapabilities({ upsertDynamicWorkflow: () => undefined }).dynamicWorkflows).toBe(
      true,
    );
    expect(probeCapabilities({ addFeedback: () => undefined }).feedback).toBe(true);
    expect(probeCapabilities({ fga: {} }).fineGrainedAuthorization).toBe(true);
    expect(
      probeCapabilities({ IFGAProvider: class IFGAProvider {} }).fineGrainedAuthorization,
    ).toBe(true);
  });
});
