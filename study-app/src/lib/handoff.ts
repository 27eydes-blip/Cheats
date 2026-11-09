"use client";
import type { DraftPage } from "./notes-client";

/**
 * In-memory hand-off between screens in the same tab (e.g. files dropped on
 * the dashboard, or pages written on /ink, arriving at /capture).
 */
let files: File[] = [];
let pages: DraftPage[] = [];

export const handoff = {
  setFiles(f: File[]) {
    files = f;
  },
  takeFiles(): File[] {
    const f = files;
    files = [];
    return f;
  },
  setPages(p: DraftPage[]) {
    pages = p;
  },
  takePages(): DraftPage[] {
    const p = pages;
    pages = [];
    return p;
  },
};
