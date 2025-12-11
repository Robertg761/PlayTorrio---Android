
import { defineConfig } from 'vite';
import path from 'path';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
    root: './src',
    build: {
        outDir: '../www',
        emptyOutDir: true,
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    plugins: [
        nodePolyfills({
            // Whether to polyfill `node:` protocol imports
            protocolImports: true,
        }),
    ],
    define: {
        'process.env': {},
        'global': 'globalThis',
    },
});
