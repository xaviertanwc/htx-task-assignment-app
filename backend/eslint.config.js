import tseslint from 'typescript-eslint';

export default tseslint.config({ ignores: ['dist/', '.data/'] }, ...tseslint.configs.recommended, {
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
  },
});
