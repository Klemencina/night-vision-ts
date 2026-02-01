import js from '@eslint/js'
import svelte from 'eslint-plugin-svelte'
import globals from 'globals'
import prettier from 'eslint-config-prettier'

/** @type {import('eslint').Linter.Config[]} */
export default [
    // Base JavaScript recommended rules
    js.configs.recommended,

    // Svelte recommended rules
    ...svelte.configs['flat/recommended'],

    // Prettier compatibility (disables conflicting rules)
    prettier,
    ...svelte.configs['flat/prettier'],

    // Global settings
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.node,
                // Chart-specific globals
                Hammer: 'readonly',
                Hamster: 'readonly',
            }
        }
    },

    // Source files configuration
    {
        files: ['src/**/*.js', 'src/**/*.svelte'],
        rules: {
            // Lenient rules (warnings, not errors) per user preference
            'no-unused-vars': 'warn',
            'no-undef': 'warn',
            'no-empty': 'warn',
            'no-constant-condition': 'warn',
            'no-prototype-builtins': 'warn',
            'no-fallthrough': 'warn',
            'no-case-declarations': 'off',
            'no-redeclare': 'off',
            'no-useless-escape': 'off',
            'no-cond-assign': 'off',

            // Code style matching existing codebase (all warnings, not errors)
            'semi': 'off', // Codebase doesn't use semicolons
            'quotes': 'off', // Too many violations to fix now
            'indent': 'off', // Mixed indentation in codebase
            'comma-dangle': 'off', // Trailing commas exist in codebase
            'no-trailing-spaces': 'off', // Many trailing spaces exist
            'eol-last': 'off', // Mixed line endings

            // Relaxed rules for existing patterns
            'no-var': 'off', // Codebase uses var in some places
            'prefer-const': 'off', // Too many violations

            // Svelte-specific (warnings only, lenient)
            'svelte/require-each-key': 'off',
            'svelte/no-at-html-tags': 'off',
            'svelte/no-unused-svelte-ignore': 'off',
            'svelte/valid-compile': 'off',
            'svelte/infinite-reactive-loop': 'warn',
            'svelte/no-dom-manipulating': 'warn'
        }
    },

    // Test files configuration
    {
        files: ['tests/**/*.js'],
        rules: {
            // Very lenient for test files - most rules off
            'no-unused-vars': 'off',
            'no-undef': 'off',
            'no-empty': 'off',
            'no-redeclare': 'off',
            'no-constant-condition': 'off',
            'no-case-declarations': 'off',
            'no-cond-assign': 'off',
            'no-useless-escape': 'off',
            'semi': 'off',
            'quotes': 'off',
            'indent': 'off',
            'no-trailing-spaces': 'off',
            'eol-last': 'off',
            'no-var': 'off',
            'prefer-const': 'off',
            'eqeqeq': 'off'
        }
    },

    // Ignore patterns
    {
        ignores: [
            'dist/**',
            'node_modules/**',
            'tests/tvjs-test/**',
            'docs/**',
            'data/**',
            'vite/**',
            '*.config.js',
            '*.config.cjs',
            'types/**'
        ]
    }
]
