import { defineConfig } from 'vite';
import styleImport from 'vite-plugin-style-import';
import path from 'path';
//import { injectHtml } from 'vite-plugin-html';

export default defineConfig({
  server: {
    watch: {
      followSymlinks: false
    },
    fs: {
      strict: false,
    },
  },
  resolve: {
    alias: {
      'easy-email-editor/lib/style.css': path.resolve(__dirname, 'package.json'),
      'easy-email-extensions/lib/style.css': path.resolve(__dirname, 'package.json'),
      '@demo': path.resolve(__dirname, './src'),
      '@extensions': path.resolve('../packages/easy-email-extensions/src'),
      '@core': path.resolve('../packages/easy-email-core/src'),
      '@arco-themes': path.resolve('./node_modules/@arco-themes'),
      react: path.resolve('./node_modules/react'),
      'react-final-form': path.resolve(__dirname, './node_modules/react-final-form'),
      'easy-email-localization': path.resolve('../packages/easy-email-localization'),
      'easy-email-editor': path.resolve('../packages/easy-email-editor/src/index.tsx'),
      '@': path.resolve('../packages/easy-email-editor/src'),
      'easy-email-core': path.resolve('../packages/easy-email-core/src/index.tsx'),
      'easy-email-extensions': path.resolve(
        '../packages/easy-email-extensions/src/index.tsx',
      ),
      '@arco-design/web-react/dist/css/arco.css': path.resolve(
        './node_modules/@arco-design/web-react/dist/css/arco.css',
      ),
    },
  },
  optimizeDeps: {},
  define: {},
  esbuild: {
    jsxInject: 'import "@arco-design/web-react/dist/css/arco.css";',
  },
  build: {
    minify: false,
    manifest: true,
    sourcemap: false,
    target: 'es2015',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (/\/node_modules\/html2canvas\/.*/.test(id)) {
            return 'html2canvas';
          }
          if (/\/node_modules\/lodash\/.*/.test(id)) {
            return 'lodash';
          }
          if (/\/node_modules\/mjml-browser\/.*/.test(id)) {
            return 'mjml-browser';
          }
          if (/easy-email.*/.test(id)) {
            return 'easy-email-editor';
          }
        },
      },
    },
  },
  css: {
    modules: {
      localsConvention: 'dashes',
    },
    preprocessorOptions: {
      scss: {},
      less: {
        javascriptEnabled: true,
      },
    },
  },
  plugins: [
    styleImport({
      libs: [
        // Dynamic import @arco-design styles
        {
          libraryName: '@arco-design/web-react',
          libraryNameChangeCase: 'pascalCase',
          esModule: true,
          resolveStyle: name => `@arco-design/web-react/es/${name}/style/index`,
        },
        {
          libraryName: '@arco-design/web-react/icon',
          libraryNameChangeCase: 'pascalCase',
          resolveStyle: name => `@arco-design/web-react/icon/react-icon/${name}`,
          resolveComponent: name => `@arco-design/web-react/icon/react-icon/${name}`,
        },
      ],
    }),
  ].filter(Boolean),
});
