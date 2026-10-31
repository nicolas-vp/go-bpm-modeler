import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // bpmn-js и dmn-js - крупные библиотеки, приложение грузится локально из бинарника
    chunkSizeWarningLimit: 4000,
  },
});
