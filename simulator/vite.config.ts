import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: '127.0.0.1' },
  build: {
    rolldownOptions: {
      output: {
        // React and the MCP client change rarely: separate files load in parallel and stay cached.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'mcp', test: /node_modules[\\/](@modelcontextprotocol|zod|ajv|eventsource-parser|pkce-challenge)/ },
          ],
        },
      },
    },
  },
});
