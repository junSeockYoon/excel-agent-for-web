import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env.js';

class SessionStore {
  constructor() {
    this.sessions = new Map();
    this._timer = setInterval(() => this.cleanup(), 60_000);
    if (this._timer.unref) this._timer.unref();
  }

  create({ id, sheets, sheetOrder, activeSheetId, file }) {
    const sessionId = id || uuidv4();
    const now = Date.now();
    const session = {
      id: sessionId,
      createdAt: now,
      lastAccessAt: now,
      files: file ? [file] : [],
      sheets,
      sheetOrder,
      activeSheetId,
      chat: [],
      chatLocked: false,
      chatContext: null,
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  setChatContext(sessionId, ctx) {
    const session = this.get(sessionId);
    if (!session) return null;
    session.chatContext = ctx || null;
    return session;
  }

  tryLockChat(sessionId) {
    const session = this.get(sessionId);
    if (!session) return false;
    if (session.chatLocked) return false;
    session.chatLocked = true;
    return true;
  }

  unlockChat(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) session.chatLocked = false;
  }

  appendChat(sessionId, turns) {
    const session = this.get(sessionId);
    if (!session) return null;
    const now = Date.now();
    for (const t of turns) {
      session.chat.push({
        role: t.role,
        content: t.content,
        at: now,
      });
    }
    const max = env.chatHistoryTurns * 2;
    if (session.chat.length > max) {
      session.chat = session.chat.slice(-max);
    }
    return session;
  }

  replace(sessionId, { sheets, sheetOrder, activeSheetId, file }) {
    // Remove memory entry without deleting the upload dir (new file already there).
    this.sessions.delete(sessionId);
    return this.create({ id: sessionId, sheets, sheetOrder, activeSheetId, file });
  }

  get(sessionId) {
    if (!sessionId) return null;
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    if (Date.now() - session.lastAccessAt > env.sessionTtlMs) {
      this.delete(sessionId);
      return null;
    }
    session.lastAccessAt = Date.now();
    return session;
  }

  touch(sessionId) {
    const s = this.get(sessionId);
    return s;
  }

  setActiveSheet(sessionId, sheetId) {
    const session = this.get(sessionId);
    if (!session) return null;
    if (!session.sheets[sheetId]) {
      const err = new Error('시트를 찾을 수 없습니다.');
      err.status = 404;
      err.code = 'SHEET_NOT_FOUND';
      err.expose = true;
      throw err;
    }
    session.activeSheetId = sheetId;
    return session;
  }

  delete(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    this.sessions.delete(sessionId);
    const dir = path.join(env.uploadDir, sessionId);
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (e) {
      console.warn('[sessionStore] upload cleanup failed', dir, e.message);
    }
    return true;
  }

  cleanup() {
    const now = Date.now();
    for (const [id, session] of this.sessions.entries()) {
      if (now - session.lastAccessAt > env.sessionTtlMs) {
        this.delete(id);
      }
    }
  }

  summary(session) {
    if (!session) return null;
    return {
      id: session.id,
      createdAt: session.createdAt,
      lastAccessAt: session.lastAccessAt,
      activeSheetId: session.activeSheetId,
      fileName: session.files[0]?.originalName ?? null,
      sheetCount: session.sheetOrder.length,
      expiresInMs: Math.max(0, env.sessionTtlMs - (Date.now() - session.lastAccessAt)),
    };
  }
}

export const sessionStore = new SessionStore();
