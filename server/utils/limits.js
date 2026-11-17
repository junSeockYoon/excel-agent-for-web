import { env } from '../config/env.js';

export const LIMITS = {
  uploadMaxBytes: env.uploadMaxBytes,
  maxRowsPerSheet: env.maxRowsPerSheet,
  maxCellsPerSheet: env.maxCellsPerSheet,
  defaultPageLimit: env.defaultPageLimit,
  maxPageLimit: env.maxPageLimit,
  sessionTtlMs: env.sessionTtlMs,
};
