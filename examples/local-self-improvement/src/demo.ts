/* eslint-disable security/detect-non-literal-fs-filename -- demo files live under the explicit local directory */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { createSkillValidator, FilesystemSkillPublisher } from '@mastra-evolution/adapters';
import { createImprovement } from '@mastra-evolution/core/improvement';
import { createLearning } from '@mastra-evolution/core/learning';
import { LocalEvolutionStore } from '@mastra-evolution/core/storage-local';

const AGENT_ID = 'analytics-agent';
const CORRECTION = 'Use booked revenue excluding cancellations.';
const SKILL_NAME = 'use-booked-revenue-excluding-cancellations';

/** Explicit review commands, no model calls, server, or background publication. */
async function main(): Promise<void> {
  const [action = 'propose', proposalId] = process.argv.slice(2);
  const directory = path.resolve(process.env.SKILL_LOOP_DIR ?? '.skill-loop-demo');
  const store = new LocalEvolutionStore({ directory });
  const skillsDirectory = path.join(directory, 'skills');
  const publisher = new FilesystemSkillPublisher({ directory: skillsDirectory });
  const improvement = createImprovement({
    store,
    publisher,
    evaluator: createSkillValidator(),
    // The approval provider is reached only by the explicit `accept <id>` command.
    approval: { requestApproval: () => Promise.resolve({ decision: 'approved' }) },
  });
  try {
    if (action === 'propose') {
      const learning = createLearning({ store, agentId: AGENT_ID, acceptThreshold: 1, sync: true });
      // A developer supplies this correction deliberately; accepting a lesson only
      // makes it eligible for drafting and never accepts the resulting skill change.
      const result = await learning.ingestSignal(
        { kind: 'correction', summary: CORRECTION, suggestedAction: 'create-skill' },
        { agentId: AGENT_ID, scope: { type: 'agent', agentId: AGENT_ID } },
      );
      if (!result?.lesson) {
        throw new Error('No lesson was recorded');
      }
      const proposal = await improvement.proposeFromLesson(result.lesson);
      const draft = await publisher.writeDraft(proposal);
      const checked = await improvement.evaluate(proposal.id);
      const skillPath = path.join(skillsDirectory, SKILL_NAME, 'SKILL.md');
      console.log(`Proposal: ${proposal.id}\nDraft: ${draft.path}\nActive skill: ${skillPath}`);
      console.log(
        `Validation: ${checked.evaluation?.verdict} (structure only; no behavioral score)`,
      );
      console.log(
        `Before:\n${await readBaseline(skillPath)}\nAfter:\n${await readFile(draft.path, 'utf8')}`,
      );
      console.log(
        `Review the change, then run demo accept ${proposal.id} or demo reject ${proposal.id}.`,
      );
      return;
    }
    if (!proposalId) {
      throw new Error('Usage: demo propose | accept <id> | reject <id> | revert <id>');
    }
    switch (action) {
      case 'accept': {
        const result = await improvement.promote(proposalId);
        console.log(
          `${result.id}: ${result.status} (${result.candidateRevision ?? 'no active revision'})`,
        );
        break;
      }
      case 'reject': {
        console.log(`${proposalId}: ${(await improvement.reject(proposalId)).status}`);
        break;
      }
      case 'revert': {
        console.log(`${proposalId}: ${(await improvement.rollback(proposalId)).status}`);
        break;
      }
      default: {
        throw new Error(`Unknown command: ${action}`);
      }
    }
  } finally {
    await store.close();
  }
}

async function readBaseline(skillPath: string): Promise<string> {
  try {
    return await readFile(skillPath, 'utf8');
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return '(new skill)';
    }
    throw error;
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
