import { defineConfig } from 'wxt';
import { fileURLToPath, URL } from 'node:url';
import vue from '@vitejs/plugin-vue';
import AutoImport from 'unplugin-auto-import/vite';
import Components from 'unplugin-vue-components/vite';
import { NaiveUiResolver } from 'unplugin-vue-components/resolvers';

export default defineConfig({
  modules: ['@wxt-dev/i18n/module'],
  srcDir: 'src',
  manifest: {
    default_locale: 'en',
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    version: '0.1.0',
    icons: {
      16: '/icon/icon16.png',
      32: '/icon/icon32.png',
      48: '/icon/icon48.png',
      128: '/icon/icon128.png',
    },
    action: {
      default_popup: 'popup/index.html',
    },
    options_ui: {
      page: 'options/index.html',
      open_in_tab: true,
    },
    background: {
      service_worker: 'background.js',
      type: 'module',
    },
    permissions: ['storage', 'alarms', 'notifications'],
    optional_host_permissions: ['http://*/*', 'https://*/*'],
  },
  vite: () => ({
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@components': fileURLToPath(new URL('./src/components', import.meta.url)),
      },
    },
    plugins: [
      vue(),
      AutoImport({
        dts: 'auto-imports.d.ts',
        vueTemplate: true,
        dirs: [
          'src/composables',
          'src/stores',
        ],
        imports: ['vue', 'pinia'],
        resolvers: [NaiveUiResolver()],
      }),
      Components({
        dts: 'components.d.ts',
        dirs: [
          'src/components',
        ],
        resolvers: [NaiveUiResolver()],
      }),
    ],
  }),
  hooks: {
    'build:manifestGenerated'(_wxt, manifest) {
      if (manifest.options_ui) {
        manifest.options_ui.open_in_tab = true;
      }
    },
  },
});
