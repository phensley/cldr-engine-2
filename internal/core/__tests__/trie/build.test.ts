import { addKey, newTrie } from '../../src/trie/build.js';

test('basic', () => {
  const keys = ['A', 'aa', 'abc'];
  const t = newTrie();
  for (let i = 0; i < keys.length; i++) {
    const v = (i + 1) * 11;
    addKey(t, keys[i], 0);
    // add the key again
    addKey(t, keys[i], v);
  }

  const char = (s: string) => s.charCodeAt(0);

  expect(t).toEqual({
    children: {
      [char('A')]: {
        children: {},
        suffix: [],
        value: 11,
      },
      [char('a')]: {
        children: {
          [char('a')]: {
            children: {},
            suffix: [],
            value: 22,
          },
          [char('b')]: {
            children: {},
            suffix: [char('c')],
            value: 33,
          },
        },
        suffix: [],
      },
    },
    suffix: [],
  });
});

test('coverage', () => {
  const keys = ['pwb', 'pw', 'p'];
  const t = newTrie();
  for (let i = 0; i < keys.length; i++) {
    addKey(t, keys[i], i + 1);
  }

  const char = (s: string) => s.charCodeAt(0);

  expect(t).toEqual({
    children: {
      [char('p')]: {
        children: {
          [char('w')]: {
            children: {
              [char('b')]: {
                children: {},
                suffix: [],
                value: 1,
              },
            },
            suffix: [],
            value: 2,
          },
        },
        suffix: [],
        value: 3,
      },
    },
    suffix: [],
  });
});
