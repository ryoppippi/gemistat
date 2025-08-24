import { ryoppippi } from '@ryoppippi/eslint-config';

export default ryoppippi({
	type: 'lib', // or 'lib'
	svelte: false,
	typescript: {
		tsconfigPath: './tsconfig.json',
	},
	ignores: [
		'tsdown.config.ts',
		'.lsmcp',
		'dist/',
	],
});
