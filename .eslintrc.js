module.exports = {
    root: true,
    env: {
        node: true,
        es6: true
    },
    parser: '@typescript-eslint/parser',
    parserOptions: {
        ecmaVersion: 6,
        sourceType: 'module'
    },
    settings: {
        'import/resolver': {
            node: {
                extensions: ['.js', '.jsx', '.ts', '.tsx']
            }
        }
    },
    plugins: [
        'eslint-plugin-import',
        'eslint-plugin-jsdoc',
        'eslint-plugin-no-null',
        'eslint-plugin-prefer-arrow',
        '@typescript-eslint',
        'prettier'
    ],
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/eslint-recommended',
        'plugin:@typescript-eslint/recommended',
        'prettier'
    ],
    rules: {
        'import/no-unresolved': 'off',
        // Overriding ESLint rules with Typescript-specific ones
        '@typescript-eslint/ban-ts-comment': [
            'error',
            {
                'ts-ignore': 'allow-with-description'
            }
        ],
        '@typescript-eslint/explicit-module-boundary-types': 'off',
        'no-bitwise': 'off',
        'no-dupe-class-members': 'off',
        '@typescript-eslint/no-dupe-class-members': 'error',
        'no-empty-function': 'off',
        '@typescript-eslint/no-empty-function': ['error'],
        '@typescript-eslint/no-empty-interface': 'off',
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-non-null-assertion': 'off',
        'no-unused-vars': 'off',
        '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '_\\w*' }],
        'no-use-before-define': 'off',
        '@typescript-eslint/no-use-before-define': [
            'error',
            {
                functions: false
            }
        ],
        'no-useless-constructor': 'off',
        '@typescript-eslint/no-useless-constructor': 'error',
        '@typescript-eslint/no-var-requires': 'off',
        '@typescript-eslint/no-floating-promises': 'error',

        // Other rules
        'class-methods-use-this': 'off',
        'func-names': 'off',
        'import/extensions': 'off',
        'import/namespace': 'off',
        'import/no-extraneous-dependencies': 'off',
        'import/no-unresolved': [
            'error',
            {
                ignore: ['monaco-editor', 'vscode']
            }
        ],
        'import/prefer-default-export': 'off',
        'linebreak-style': 'off',
        'no-await-in-loop': 'off',
        'no-console': 'off',
        'no-control-regex': 'off',
        'no-extend-native': 'off',
        'no-multi-str': 'off',
        'no-param-reassign': 'off',
        'no-prototype-builtins': 'off',
        'no-restricted-syntax': [
            'error',
            {
                selector: 'ForInStatement',
                message:
                    'for..in loops iterate over the entire prototype chain, which is virtually never what you want. Use Object.{keys,values,entries}, and iterate over the resulting array.'
            },

            {
                selector: 'LabeledStatement',
                message:
                    'Labels are a form of GOTO; using them makes code confusing and hard to maintain and understand.'
            },
            {
                selector: 'WithStatement',
                message: '`with` is disallowed in strict mode because it makes code impossible to predict and optimize.'
            }
        ],
        'no-template-curly-in-string': 'off',
        'no-underscore-dangle': 'off',
        'no-useless-escape': 'off',
        'no-void': [
            'error',
            {
                allowAsStatement: true
            }
        ],
        'operator-assignment': 'off',
        strict: 'off'
    },
    overrides: [
        {
            files: ['**/*.test.ts', '**/*.test.tsx'],
            env: {
                mocha: true
            }
        },
        {
            files: ['**/src/client/**/*.ts*'],
            parserOptions: {
                project: 'src/client/tsconfig.json',
                sourceType: 'module'
            },
            env: {
                browser: true
            },
            rules: {
                'import/no-unresolved': 'off'
            }
        },
        {
            files: ['**/src/extension/**/*.ts*'],
            parserOptions: {
                project: 'src/extension/tsconfig.json',
                sourceType: 'module'
            },
            env: {
                browser: true
            },
            rules: {
                'import/no-unresolved': 'off'
            }
        },
        {
            files: ['build/**/*.js'],
            rules: {
                '@typescript-eslint/no-var-requires': 'off'
            }
        },
        {
            files: ['build/**/plugins/**/*.js'],
            rules: {
                'no-unused-vars': 'off',
                '@typescript-eslint/no-unused-vars': 'off',
                '@typescript-eslint/no-empty-function': 'off'
            }
        },
        {
            files: ['src/**/*.d.ts'],
            rules: {
                '@typescript-eslint/no-explicit-any': 'off',
                '@typescript-eslint/ban-types': 'off',
                '@typescript-eslint/adjacent-overload-signatures': 'off',
                'no-irregular-whitespace': 'off'
            }
        }
    ]
};
