/** Upper bound for pattern/backup files read by the app (NFR-5). */
export const MAX_JSON_BYTES = 20 * 1024 * 1024;

/** Read a user-picked text file with a size limit. */
export async function readTextFile(file: File): Promise<string> {
  if (file.size > MAX_JSON_BYTES) throw new Error('too-large');
  return file.text();
}

/**
 * Hand a file to the user: the share sheet where it can carry files (phones: AirDrop, messages,
 * Files), otherwise a download.
 */
export async function saveFile(
  name: string,
  text: string,
  type = 'application/json',
): Promise<'shared' | 'downloaded'> {
  const blob = new Blob([text], { type });
  const file = new File([blob], name, { type });
  try {
    if (navigator.canShare?.({ files: [file] }) && matchMedia('(pointer: coarse)').matches) {
      await navigator.share({ files: [file], title: name });
      return 'shared';
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'shared';
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}

/** File-name-safe slug. */
export function slug(text: string): string {
  return (
    text
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/ł/g, 'l')
      .replace(/Ł/g, 'L')
      .replace(/[^\w-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 60) || 'wzor'
  );
}

export const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
