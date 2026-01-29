#!/usr/bin/env node
/**
 * Build script for Lambda@Edge functions
 * Lambda@Edge requires CommonJS format and has specific constraints
 */

import * as esbuild from 'esbuild';
import { mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = join(__dirname, '..', 'src', 'edge');
const outDir = join(__dirname, '..', 'dist', 'edge');

const edgeFunctions = ['auth', 'callback'];

async function build() {
  // Ensure output directory exists
  await mkdir(outDir, { recursive: true });

  for (const name of edgeFunctions) {
    console.log(`Building ${name}.ts...`);

    await esbuild.build({
      entryPoints: [join(srcDir, `${name}.ts`)],
      bundle: true,
      platform: 'node',
      target: 'node20',
      format: 'cjs', // Lambda@Edge requires CommonJS
      outfile: join(outDir, `${name}.js`),
      minify: true,
      sourcemap: false, // Lambda@Edge doesn't support source maps well
      external: [], // Bundle everything
      define: {
        'process.env.NODE_ENV': '"production"',
      },
      // Lambda@Edge has a 1MB limit for viewer request functions
      logLevel: 'info',
    });

    console.log(`Built ${name}.js`);
  }

  console.log('Edge functions built successfully!');
}

build().catch((error) => {
  console.error('Build failed:', error);
  process.exit(1);
});
