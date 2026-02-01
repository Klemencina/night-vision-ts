import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
    test: {
        environment: 'happy-dom',
        globals: true,
        include: ['tests/unit/**/*.{test,spec}.{js,ts}'],
        exclude: [
            'node_modules/**',
            'dist/**',
            'tests/tvjs-test/**'
        ],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'json'],
            exclude: [
                'node_modules/**',
                'dist/**',
                'tests/**',
                '**/*.config.js'
            ]
        }
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src')
        }
    }
})
