import { formatError } from '../formatError';

it('preserves error name, message and the full stack on one line', () => {
  const error = new TypeError('bad input\nsecond line');
  error.stack = 'TypeError: bad input\n  at first\r\n  at second';
  const formatted = formatError(error);
  expect(formatted).not.toMatch(/[\r\n]/);
  expect(JSON.parse(formatted)).toEqual({
    name: 'TypeError', message: error.message,
    stack: 'TypeError: bad input |   at first |   at second',
  });
});

it('formats non-Error thrown values', () => {
  expect(JSON.parse(formatError('failure'))).toEqual({ name: 'UnknownError', message: 'failure' });
});
