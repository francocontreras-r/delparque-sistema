import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Variables no usadas: aviso (no bloquea), ignora constantes en MAYÚSCULAS y args con _
      'no-unused-vars': ['warn', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
      'react-refresh/only-export-components': 'warn',
      'no-useless-assignment': 'warn',
      // Permitir catch vacío (se usa para PDFs: try { addImage } catch {})
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Reglas del React Compiler: son sugerencias de optimización, no errores.
      // Se dejan como aviso para no bloquear sobre código existente que funciona.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/purity': 'warn',
    },
  },
  // Scripts de seed, funciones serverless y configs: corren en Node
  {
    files: ['src/scripts/**', 'api/**', '*.config.js'],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: 'module',
    },
  },
])
