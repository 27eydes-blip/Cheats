/** Hand a finished file to the user. Must be called from a tap. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function canShareFile(blob: Blob, filename: string): boolean {
  try {
    const file = new File([blob], filename, { type: blob.type });
    return typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/** iOS share sheet: Save to Files, AirDrop, Messages… */
export async function shareBlob(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: blob.type });
  try {
    await navigator.share({ files: [file], title: filename });
  } catch (err) {
    if (!(err instanceof DOMException && err.name === "AbortError")) throw err;
  }
}
