import { describe, it, expect, beforeEach } from 'vitest';
import { DashPanel } from './DashPanel';

describe('DashPanel', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders overlay and panel elements', () => {
    const dp = new DashPanel();
    expect(document.querySelector('.dashpanel-overlay')).toBeTruthy();
    expect(document.querySelector('.dashpanel')).toBeTruthy();
    expect(document.querySelector('.dashpanel-header')).toBeTruthy();
    expect(document.querySelector('.dashpanel-body')).toBeTruthy();
    expect(document.querySelector('.dashpanel-footer')).toBeTruthy();
    expect(document.querySelector('.dashpanel-input')).toBeTruthy();
    expect(document.querySelector('.dashpanel-send')).toBeTruthy();
  });

  it('starts hidden', () => {
    const dp = new DashPanel();
    const overlay = document.querySelector('.dashpanel-overlay') as HTMLElement;
    expect(overlay.classList.contains('open')).toBe(false);
    expect(dp.isOpen).toBe(false);
  });

  it('open() makes it visible', () => {
    const dp = new DashPanel();
    dp.open();
    const overlay = document.querySelector('.dashpanel-overlay') as HTMLElement;
    expect(overlay.classList.contains('open')).toBe(true);
    expect(dp.isOpen).toBe(true);
  });

  it('close button hides the panel', () => {
    const dp = new DashPanel();
    dp.open();
    const closeBtn = document.querySelector('.dashpanel-close') as HTMLElement;
    closeBtn.click();
    const overlay = document.querySelector('.dashpanel-overlay') as HTMLElement;
    expect(overlay.classList.contains('open')).toBe(false);
    expect(dp.isOpen).toBe(false);
  });

  it('clicking overlay background closes it', () => {
    const dp = new DashPanel();
    dp.open();
    const overlay = document.querySelector('.dashpanel-overlay') as HTMLElement;
    overlay.click();
    expect(overlay.classList.contains('open')).toBe(false);
    expect(dp.isOpen).toBe(false);
  });

  it('Escape key closes the panel', () => {
    const dp = new DashPanel();
    dp.open();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    const overlay = document.querySelector('.dashpanel-overlay') as HTMLElement;
    expect(overlay.classList.contains('open')).toBe(false);
    expect(dp.isOpen).toBe(false);
  });

  it('toggle() opens when closed and closes when open', () => {
    const dp = new DashPanel();
    expect(dp.isOpen).toBe(false);
    dp.toggle();
    expect(dp.isOpen).toBe(true);
    dp.toggle();
    expect(dp.isOpen).toBe(false);
  });

  it('addMessage creates user bubble', () => {
    const dp = new DashPanel();
    dp.addMessage('user', 'hello');
    const msgs = document.querySelectorAll('.chat-msg');
    expect(msgs.length).toBe(1);
    expect(msgs[0].classList.contains('user')).toBe(true);
    expect(msgs[0].textContent).toBe('hello');
  });

  it('addMessage creates assistant bubble', () => {
    const dp = new DashPanel();
    dp.addMessage('assistant', 'hi there');
    const msgs = document.querySelectorAll('.chat-msg');
    expect(msgs.length).toBe(1);
    expect(msgs[0].classList.contains('assistant')).toBe(true);
    expect(msgs[0].textContent).toBe('hi there');
  });

  it('addMessage adds multiple messages in order', () => {
    const dp = new DashPanel();
    dp.addMessage('user', 'msg1');
    dp.addMessage('assistant', 'msg2');
    const msgs = document.querySelectorAll('.chat-msg');
    expect(msgs.length).toBe(2);
    expect(msgs[0].textContent).toBe('msg1');
    expect(msgs[1].textContent).toBe('msg2');
  });

  it('send() adds user message and clears input', () => {
    const dp = new DashPanel();
    const input = document.querySelector('.dashpanel-input') as HTMLInputElement;
    input.value = 'test message';
    const sendBtn = document.querySelector('.dashpanel-send') as HTMLButtonElement;
    sendBtn.click();
    const msgs = document.querySelectorAll('.chat-msg');
    expect(msgs.length).toBe(1);
    expect(msgs[0].textContent).toBe('test message');
    expect(input.value).toBe('');
  });

  it('Enter key triggers send', () => {
    const dp = new DashPanel();
    const input = document.querySelector('.dashpanel-input') as HTMLInputElement;
    input.value = 'enter message';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    const msgs = document.querySelectorAll('.chat-msg');
    expect(msgs.length).toBe(1);
    expect(msgs[0].textContent).toBe('enter message');
  });

  it('send ignores empty input', () => {
    const dp = new DashPanel();
    const sendBtn = document.querySelector('.dashpanel-send') as HTMLButtonElement;
    sendBtn.click();
    const msgs = document.querySelectorAll('.chat-msg');
    expect(msgs.length).toBe(0);
  });

  it('send ignores whitespace-only input', () => {
    const dp = new DashPanel();
    const input = document.querySelector('.dashpanel-input') as HTMLInputElement;
    input.value = '   ';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    const msgs = document.querySelectorAll('.chat-msg');
    expect(msgs.length).toBe(0);
  });

  it('onSend callback fires with message text', () => {
    const dp = new DashPanel();
    let received = '';
    dp.onSend = (text) => { received = text; };
    const input = document.querySelector('.dashpanel-input') as HTMLInputElement;
    input.value = 'callback test';
    const sendBtn = document.querySelector('.dashpanel-send') as HTMLButtonElement;
    sendBtn.click();
    expect(received).toBe('callback test');
  });

  it('open() returns a Promise that resolves on close', async () => {
    const dp = new DashPanel();
    const promise = dp.open();
    const closeBtn = document.querySelector('.dashpanel-close') as HTMLElement;
    closeBtn.click();
    await expect(promise).resolves.toBeUndefined();
  });

  it('destroy removes DOM elements', () => {
    const dp = new DashPanel();
    dp.destroy();
    expect(document.querySelector('.dashpanel-overlay')).toBeNull();
  });

  it('destroy after open cleans up', () => {
    const dp = new DashPanel();
    dp.open();
    dp.destroy();
    expect(document.querySelector('.dashpanel-overlay')).toBeNull();
  });

  it('send with onSend null does not throw', () => {
    const dp = new DashPanel();
    const input = document.querySelector('.dashpanel-input') as HTMLInputElement;
    input.value = 'test';
    const sendBtn = document.querySelector('.dashpanel-send') as HTMLButtonElement;
    expect(() => sendBtn.click()).not.toThrow();
  });
});


