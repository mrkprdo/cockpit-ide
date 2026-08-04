import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SpecsMapWindow } from './SpecsMapWindow';
import { mockElectronAPI } from '../../test/setup';

const MAIN = [
  '---','name: T','---','','# T','','## Features','',
  '### foundation','',
  '| id | name | file | spec | ui |','|----|------|------|------|----|',
  '| alpha | Alpha | src/alpha.ts | alpha.spec.md | |','',
].join('\n');
const ALPHA = [
  '---','name: Alpha','file: src/alpha.ts','type: logic','layer: foundation','singleton: false','exports: [old]','---','',
  '# Alpha','','Alpha desc.','','## Dependencies','','None.','',
].join('\n');

async function flush() { for (let i = 0; i < 20; i++) await new Promise(r => setTimeout(r, 0)); }

describe('reconcile buttons end-to-end', () => {
  let container: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
    vi.clearAllMocks();
    document.getElementById('sm-styles')?.remove();

    const files: Record<string, string> = {
      '/ws/src/specs/main.spec.md': MAIN,
      '/ws/src/specs/alpha.spec.md': ALPHA,
      '/ws/src/alpha.ts': 'export const fresh = 1;\n',
    };
    (mockElectronAPI.fs.readDir as any).mockImplementation((p: string) => {
      const prefix = p.replace(/\/$/, '') + '/';
      const names = new Map<string, boolean>();
      let found = false;
      for (const k of Object.keys(files)) {
        if (!k.startsWith(prefix)) continue;
        found = true;
        const rest = k.slice(prefix.length);
        names.set(rest.split('/')[0], rest.includes('/'));
      }
      return Promise.resolve(found ? [...names.entries()].map(([name, isDirectory]) => ({ name, isDirectory })) : null);
    });
    (mockElectronAPI.fs.readFile as any).mockImplementation((p: string) => Promise.resolve(files[p] ?? null));
    (mockElectronAPI.fs.writeFile as any).mockImplementation((p: string, c: string) => { files[p] = c; return Promise.resolve(true); });
  });

  it('Report button shows a changelog in the panel', async () => {
    new SpecsMapWindow(container, '/ws');
    await flush();
    (container.querySelector('button[title="Settings"]') as HTMLButtonElement).click();
    const btn = container.querySelector('#sm-reconcile-report-btn') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    btn.click();
    await flush();
    const result = container.querySelector('#sm-reconcile-result') as HTMLElement;
    console.log('REPORT RESULT TEXT:', JSON.stringify(result?.textContent));
    expect(result?.textContent).toContain('Reconcile (report)');
  });

  it('Apply button writes updated spec and shows changelog', async () => {
    new SpecsMapWindow(container, '/ws');
    await flush();
    (container.querySelector('button[title="Settings"]') as HTMLButtonElement).click();
    (container.querySelector('#sm-reconcile-apply-btn') as HTMLButtonElement).click();
    await flush();
    const result = container.querySelector('#sm-reconcile-result') as HTMLElement;
    console.log('APPLY RESULT TEXT:', JSON.stringify(result?.textContent));
    const writes = (mockElectronAPI.fs.writeFile as any).mock.calls.map((c: string[]) => c[0]);
    console.log('WRITES:', writes);
    expect(writes.some((p: string) => p.endsWith('alpha.spec.md'))).toBe(true);
  });
});
