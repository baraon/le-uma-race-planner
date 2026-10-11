import { describe, expect, it } from 'vitest';
import { matchRoute } from './router';

describe('matchRoute', () => {
  it('extracts params and rejects other shapes', () => {
    expect(matchRoute('/', '/')).toEqual({});
    expect(matchRoute('/groups/:groupId', '/groups/abc')).toEqual({ groupId: 'abc' });
    expect(matchRoute('/groups/:groupId', '/groups/abc/')).toEqual({ groupId: 'abc' });
    expect(matchRoute('/groups/:groupId', '/groups/abc/events/new')).toBeNull();
    expect(matchRoute('/groups/:groupId/events/new', '/groups/abc/events/new')).toEqual({
      groupId: 'abc',
    });
    expect(matchRoute('/events/:id/edit', '/events/x/view')).toBeNull();
    expect(matchRoute('/invite/:token', '/invite/a%2Db')).toEqual({ token: 'a-b' });
  });
});
