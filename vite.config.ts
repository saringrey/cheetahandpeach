import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        // Static vendor groups keep the full journey eagerly available while
        // avoiding one monolithic startup chunk. Preserving execution order is
        // important for React Three Fiber and Three.js side-effectful modules.
        strictExecutionOrder: true,
        codeSplitting: {
          groups: [
            {
              name: 'three',
              test: /node_modules[\\/](?:three|three-stdlib)[\\/]/,
              minSize: 20_000,
              maxSize: 450_000,
              priority: 40,
            },
            {
              name: 'r3f',
              test: /node_modules[\\/]@react-three[\\/]/,
              priority: 35,
            },
            {
              name: 'react',
              test: /node_modules[\\/](?:react|react-dom|scheduler|zustand)[\\/]/,
              priority: 25,
            },
            {
              name: 'vendor',
              test: /node_modules[\\/]/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
})
