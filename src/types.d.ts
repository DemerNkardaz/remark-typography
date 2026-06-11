import 'mdast';

declare module 'mdast' {
	interface Data {
		skipTypography?: boolean;
	}
}
