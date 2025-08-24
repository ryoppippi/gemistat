import { defineConfig } from 'tsdown';
import Macros from 'unplugin-macros/rolldown';

export default defineConfig({
	entry: [
		'src/index.ts',
	],
	outDir: 'dist',
	format: 'esm',
	clean: true,
	sourcemap: false,
	minify: 'dce-only',
	treeshake: true,
	dts:false,
	publint: true,
	unused: true,
	nodeProtocol: true,
	define: {
		'import.meta.vitest': 'undefined',
	},
	onSuccess: 'sort-package-json',
	plugins: [
		Macros({
			include: ['src/index.ts', 'src/pricing.ts'],
		}),
	],
});
