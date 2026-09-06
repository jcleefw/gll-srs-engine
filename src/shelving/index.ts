export type {
  ShelvingConfig,
  ShelvedWord,
  ShelvingDecision,
  ShelvingHooks,
} from './types.js';
export { DEFAULT_SHELVING_CONFIG } from './types.js';
export { evaluateShelving, unshelveAll } from './policy.js';
