import playersFile from '../data/players.min.json';
import opponentsFile from '../data/opponents.min.json';
import { makeDataset, type RawOpponentsFile, type RawPlayersFile } from './dataset';
import { createEngine, type Engine } from './draft';

let engine: Engine | null = null;

/** Lazily-built engine over the bundled dataset. */
export function getEngine(): Engine {
  engine ??= createEngine(makeDataset(playersFile as unknown as RawPlayersFile, opponentsFile as unknown as RawOpponentsFile));
  return engine;
}

export * from './types';
export * from './prng';
export * from './simulator';
export * from './draft';
export * from './bots';
