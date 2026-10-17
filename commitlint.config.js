export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      1,
      'always',
      [
        'core',
        'renderer',
        'importer',
        'fixtures',
        'web',
        'docker',
        'ci',
        'deps',
        'docs',
        'release',
      ],
    ],
    'body-max-line-length': [1, 'always', 100],
  },
};
