import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AiDrawer } from './AiDrawer';

function flush(): Promise<void> {
  return new Promise(r => setTimeout(r, 10));
}

async function createDrawer(): Promise<AiDrawer> {
  const d = new AiDrawer();
  await flush();
  return d;
}

describe('AiDrawer', () => {
  let drawer: AiDrawer;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    document.body.innerHTML = '';
    const canvas = document.createElement('div');
    canvas.id = 'canvas';
    canvas.style.cssText = 'width:1920px;height:1080px;position:relative';
    document.body.appendChild(canvas);

    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'Refined code:\n\n```ts\nconst x = 1;\n```\n\nAll loops passed.' } }],
      }),
    });

    const mockAPI = (window as any).electronAPI;
    mockAPI.prefs.load.mockResolvedValue({
      aiApiKey: 'sk-test-key',
      aiModel: 'gpt-4o-mini',
      aiEndpoint: 'https://api.openai.com/v1',
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function q(sel: string) {
    return drawer['el'].querySelector(sel) as HTMLElement;
  }

  it('creates DOM structure with chat elements', async () => {
    drawer = await createDrawer();
    expect(q('.ai-drawer-header')).toBeTruthy();
    expect(q('.ai-drawer-title')).toBeTruthy();
    expect(q('.ai-drawer-settings-btn')).toBeTruthy();
    expect(q('.ai-chat-messages')).toBeTruthy();
    expect(q('.ai-chat-input')).toBeTruthy();
    expect(q('.ai-chat-send-btn')).toBeTruthy();
    expect(document.querySelector('.ai-drawer-notch')).toBeTruthy();
  });

  it('shows welcome message on creation', async () => {
    drawer = await createDrawer();
    expect(q('.ai-chat-messages').textContent).toContain('LLMLOOP ready');
  });

  it('title shows LLMLOOP', async () => {
    drawer = await createDrawer();
    expect(q('.ai-drawer-title').textContent).toBe('LLMLOOP');
  });

  it('toggle() opens drawer', async () => {
    drawer = await createDrawer();
    expect(drawer['el'].classList.contains('is-open')).toBe(false);
    drawer.toggle();
    expect(drawer['el'].classList.contains('is-open')).toBe(true);
  });

  it('toggle() closes drawer when open', async () => {
    drawer = await createDrawer();
    drawer.toggle();
    expect(drawer['el'].classList.contains('is-open')).toBe(true);
    drawer.toggle();
    expect(drawer['el'].classList.contains('is-open')).toBe(false);
  });

  it('Escape key closes drawer', async () => {
    drawer = await createDrawer();
    drawer.toggle();
    expect(drawer['el'].classList.contains('is-open')).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(drawer['el'].classList.contains('is-open')).toBe(false);
  });

  it('sends message on button click and shows assistant response', async () => {
    drawer = await createDrawer();
    drawer.toggle();

    const input = q('.ai-chat-input') as HTMLTextAreaElement;
    const sendBtn = q('.ai-chat-send-btn');
    input.value = 'Fix this TypeScript code';
    sendBtn.click();
    await flush();

    const messagesEl = q('.ai-chat-messages');
    expect(messagesEl.querySelectorAll('.ai-chat-msg-user').length).toBe(1);
    expect(messagesEl.querySelectorAll('.ai-chat-msg-assistant').length).toBeGreaterThanOrEqual(1);
  });

  it('sends message on Enter key', async () => {
    drawer = await createDrawer();
    drawer.toggle();

    const input = q('.ai-chat-input') as HTMLTextAreaElement;
    input.value = 'Test prompt';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: false }));
    await flush();

    expect(q('.ai-chat-messages').querySelectorAll('.ai-chat-msg-user').length).toBe(1);
  });

  it('Shift+Enter does not send', async () => {
    drawer = await createDrawer();
    drawer.toggle();

    const input = q('.ai-chat-input') as HTMLTextAreaElement;
    input.value = 'Test prompt';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true }));
    expect(q('.ai-chat-messages').querySelectorAll('.ai-chat-msg-user').length).toBe(0);
  });

  it('clears input after send', async () => {
    drawer = await createDrawer();
    drawer.toggle();

    const input = q('.ai-chat-input') as HTMLTextAreaElement;
    const sendBtn = q('.ai-chat-send-btn');
    input.value = 'Fix this code';
    sendBtn.click();
    await flush();
    expect(input.value).toBe('');
  });

  it('shows error when API key is missing', async () => {
    const mockAPI = (window as any).electronAPI;
    mockAPI.prefs.load.mockResolvedValue({});

    const drawer2 = new AiDrawer();
    await flush();
    drawer2.toggle();

    const input = drawer2['el'].querySelector('.ai-chat-input') as HTMLTextAreaElement;
    const sendBtn = drawer2['el'].querySelector('.ai-chat-send-btn') as HTMLElement;
    input.value = 'Fix this code';
    sendBtn.click();
    await flush();

    const messagesEl = drawer2['el'].querySelector('.ai-chat-messages')!;
    expect(messagesEl.textContent).toContain('No API key configured');
  });

  it('does not send empty messages', async () => {
    drawer = await createDrawer();
    drawer.toggle();

    q('.ai-chat-send-btn').click();
    expect(q('.ai-chat-messages').querySelectorAll('.ai-chat-msg-user').length).toBe(0);
  });

  it('disables input while loading', async () => {
    let resolveFetch: (v: any) => void = () => {};
    globalThis.fetch = vi.fn().mockReturnValue(new Promise((resolve) => {
      resolveFetch = resolve;
    }));

    drawer = await createDrawer();
    drawer.toggle();

    const input = q('.ai-chat-input') as HTMLTextAreaElement;
    const sendBtn = q('.ai-chat-send-btn') as HTMLButtonElement;

    input.value = 'Test';
    sendBtn.click();

    expect(input.disabled).toBe(true);
    expect(sendBtn.disabled).toBe(true);

    resolveFetch({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: 'done' } }] }),
    });
    await flush();

    expect(input.disabled).toBe(false);
    expect(sendBtn.disabled).toBe(false);
  });

  it('shows loading dots while waiting for API', async () => {
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}));

    drawer = await createDrawer();
    drawer.toggle();

    (q('.ai-chat-input') as HTMLTextAreaElement).value = 'Test';
    q('.ai-chat-send-btn').click();

    const loadingEl = drawer['el'].querySelector('.ai-chat-loading') as HTMLElement;
    expect(loadingEl.style.display).toBe('flex');
  });

  it('shows settings panel when gear icon clicked', async () => {
    drawer = await createDrawer();
    drawer.toggle();

    const settingsEl = drawer['el'].querySelector('.ai-drawer-settings') as HTMLElement;
    expect(settingsEl.style.display).toBe('none');
    q('.ai-drawer-settings-btn').click();
    expect(settingsEl.style.display).toBe('block');
  });

  it('closes settings on close button', async () => {
    drawer = await createDrawer();
    drawer.toggle();

    q('.ai-drawer-settings-btn').click();

    const closeBtn = drawer['el'].querySelector('.ai-settings-close') as HTMLElement;
    closeBtn.click();

    expect((drawer['el'].querySelector('.ai-drawer-settings') as HTMLElement).style.display).toBe('none');
  });

  it('saves settings and hides panel', async () => {
    drawer = await createDrawer();
    drawer.toggle();

    q('.ai-drawer-settings-btn').click();

    const endpointInput = drawer['el'].querySelector('.ai-settings-input[data-key="endpoint"]') as HTMLInputElement;
    const apiKeyInput = drawer['el'].querySelector('.ai-settings-input[data-key="apiKey"]') as HTMLInputElement;
    const modelInput = drawer['el'].querySelector('.ai-settings-input[data-key="model"]') as HTMLInputElement;

    endpointInput.value = 'https://custom.api.com/v1';
    apiKeyInput.value = 'sk-new-key';
    modelInput.value = 'gpt-4';

    (drawer['el'].querySelector('.ai-settings-save') as HTMLElement).click();
    await flush();

    expect(drawer['endpoint']).toBe('https://custom.api.com/v1');
    expect(drawer['apiKey']).toBe('sk-new-key');
    expect(drawer['model']).toBe('gpt-4');
    expect((drawer['el'].querySelector('.ai-drawer-settings') as HTMLElement).style.display).toBe('none');
  });

  it('copy button copies code from assistant message', async () => {
    drawer = await createDrawer();
    drawer.toggle();

    (q('.ai-chat-input') as HTMLTextAreaElement).value = 'Test';
    q('.ai-chat-send-btn').click();
    await flush();

    expect(drawer['el'].querySelectorAll('.ai-chat-copy-btn').length).toBeGreaterThanOrEqual(1);
  });

  it('handles API errors gracefully', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    });

    drawer = await createDrawer();
    drawer.toggle();

    (q('.ai-chat-input') as HTMLTextAreaElement).value = 'Test';
    q('.ai-chat-send-btn').click();
    await flush();

    expect(q('.ai-chat-messages').textContent).toContain('Error:');
  });

  it('notch button toggles drawer', async () => {
    drawer = await createDrawer();
    const notch = document.querySelector('.ai-drawer-notch') as HTMLElement;
    expect(drawer['el'].classList.contains('is-open')).toBe(false);

    notch.click();
    expect(drawer['el'].classList.contains('is-open')).toBe(true);

    notch.click();
    expect(drawer['el'].classList.contains('is-open')).toBe(false);
  });

  it('renders code blocks in messages', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'Here is the fix:\n\n```typescript\nconst fixed = true;\n```\n\nDone.' } }],
      }),
    });

    drawer = await createDrawer();
    drawer.toggle();

    (q('.ai-chat-input') as HTMLTextAreaElement).value = 'Fix';
    q('.ai-chat-send-btn').click();
    await flush();

    const codeBlocks = drawer['el'].querySelectorAll('.ai-chat-code');
    expect(codeBlocks.length).toBeGreaterThanOrEqual(1);
    expect(codeBlocks[0].textContent).toContain('const fixed = true');
  });

  it('renders bold and italic markdown', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: '**Bold** and *italic* text.' } }],
      }),
    });

    drawer = await createDrawer();
    drawer.toggle();

    (q('.ai-chat-input') as HTMLTextAreaElement).value = 'Test';
    q('.ai-chat-send-btn').click();
    await flush();

    const messagesEl = q('.ai-chat-messages');
    const lastAssistant = messagesEl.querySelector('.ai-chat-msg-assistant:last-of-type .ai-chat-msg-text');
    expect(lastAssistant).toBeTruthy();
    expect(lastAssistant!.querySelector('strong')?.textContent).toBe('Bold');
    expect(lastAssistant!.querySelector('em')?.textContent).toBe('italic');
  });
});
