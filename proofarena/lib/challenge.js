import fs from 'node:fs';
import path from 'node:path';
import { challengeDir, CHALLENGES } from './paths';
import { readDb } from './db';

// Platform-verified challenges live in challenges/<id>/challenge.json (with hidden tests).
// Company-authored challenges live in the database and use the review track.
function fileChallenge(id) {
  const file = path.join(challengeDir(id), 'challenge.json');
  if (!fs.existsSync(file)) return null;
  return { status: 'live', ...JSON.parse(fs.readFileSync(file, 'utf8')) };
}

export function getChallenge(id) {
  return fileChallenge(id) || (readDb().customChallenges || []).find((c) => c.id === id) || null;
}

export function challengeTestPath(id, file) {
  return path.join(challengeDir(id), 'tests', file);
}

export function getMissionDef(challengeId, missionId) {
  return getChallenge(challengeId)?.missions.find((m) => m.id === missionId) || null;
}

export function listLibrary() {
  const live = fs
    .readdirSync(CHALLENGES, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => fileChallenge(d.name))
    .filter(Boolean);
  const custom = (readDb().customChallenges || []).map((c) => ({ ...c, status: 'custom' }));
  return [...live, ...custom];
}
