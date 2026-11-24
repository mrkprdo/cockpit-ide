// Refuse a file the main-process fs bridge would refuse, *before* a tab exists
// over it: an empty editor in front of a 400 MB file invites saving over it.

import { showToast } from '../toast';
import { MAX_TEXT_FILE_BYTES } from '../../../shared/file-limits';

/** True when the file was refused (a toast already told the user why). */
export async function refuseOversized(filePath: string, name: string): Promise<boolean> {
  try {
    const meta = await window.electronAPI?.fs.stat(filePath);
    if (!meta || meta.isDirectory || meta.size <= MAX_TEXT_FILE_BYTES) return false;
    const mb = (n: number) => Math.round(n / (1024 * 1024));
    showToast(`${name} is ${mb(meta.size)} MB — too large to open as text (limit ${mb(MAX_TEXT_FILE_BYTES)} MB).`, 'error');
    return true;
  } catch { return false; } // unknown size: let the read decide
}
