const expoConfig = require('eslint-config-expo/flat')
const prettierPlugin = require('eslint-plugin-prettier')
const prettierConfig = require('eslint-config-prettier')
const tsEslint = require('@typescript-eslint/eslint-plugin')

module.exports = [
  ...expoConfig,
  prettierConfig,
  {
    plugins: {
      prettier: prettierPlugin,
      '@typescript-eslint': tsEslint,
    },
    rules: {
      'prettier/prettier': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Reads go through liveFirestore, which keeps a copy on the phone so the
    // native app works with no signal. Imported from Firestore directly, a
    // screen would work online and come up empty offline.
    files: ['src/**/*.{ts,tsx}', 'app/**/*.{ts,tsx}'],
    ignores: ['src/lib/liveFirestore*.ts', 'src/lib/keptSnapshot.ts', '**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'firebase/firestore',
              importNames: ['onSnapshot', 'getDoc', 'getDocs'],
              message:
                "Import these from '@/lib/liveFirestore', which keeps a copy for the native app to use offline.",
            },
          ],
        },
      ],
    },
  },
  {
    ignores: ['dist/', 'node_modules/', 'functions/', '.expo/', 'babel.config.js', 'eslint.config.js'],
  },
]
