import { describe, it, expect, vi, afterEach } from 'vitest';
import { createLogger } from './logger';

describe('renderer logger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('tags every line with [source] via the matching console method', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const log = createLogger('my-module');
    log.info('hello', 42);
    expect(infoSpy).toHaveBeenCalledWith('[my-module]', 'hello', 42);
  });

  it('routes each level to its console method', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logger = createLogger('x');
    logger.debug('d');
    logger.log('l');
    logger.warn('w');
    logger.error('e');
    expect(debug).toHaveBeenCalledWith('[x]', 'd');
    expect(log).toHaveBeenCalledWith('[x]', 'l');
    expect(warn).toHaveBeenCalledWith('[x]', 'w');
    expect(error).toHaveBeenCalledWith('[x]', 'e');
  });

  it('never throws when a console method fails', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => { throw new Error('console broke'); });
    const logger = createLogger('x');
    expect(() => logger.log('boom')).not.toThrow();
    expect(logSpy).toHaveBeenCalled();
  });
});
