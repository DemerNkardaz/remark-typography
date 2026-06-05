import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
	{ ignores: ['dist/', 'coverage/', 'node_modules/'] },

	js.configs.recommended,
	...tseslint.configs.recommended,
	...tseslint.configs.stylistic,

	{
		files: ['**/*.ts', '**/*.tsx'],
		languageOptions: {
			ecmaVersion: 'latest',
			sourceType: 'module',
		},
		rules: {
			'@typescript-eslint/no-unused-vars': [
				'warn',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
				},
			],
			'@typescript-eslint/no-explicit-any': 'warn',
			'no-console': [
				'warn',
				{
					allow: ['warn', 'error'],
				},
			],
		},
	},

	{
		files: ['*.config.mjs', '*.config.ts'],
		languageOptions: {
			globals: {
				console: 'readonly',
				process: 'readonly',
			},
		},
	},

	prettier
);
