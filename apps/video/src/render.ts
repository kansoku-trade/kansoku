import { renderVideo } from '@revideo/renderer';

async function main() {
  await renderVideo({
    projectFile: './src/project.tsx',
    settings: {
      logProgress: true,
      outDir: './output',
      outFile: 'kansoku-product-intro.mp4',
    },
  });
}

void main();
