import { describe, expect, it, vi } from 'vitest';
import type { IExecuteFunctions } from 'n8n-workflow';

import { RecentReborn } from './RecentReborn.node';

/**
 * Builds a minimal IExecuteFunctions stub whose
 * `helpers.httpRequestWithAuthentication` returns one canned response per call,
 * in order. Enough to drive `fetchAllPages` through `execute()` without a real
 * n8n runtime or network access.
 */
function makeExecuteContext(
	responses: Array<{ results?: unknown[]; next_pagination_token?: string }>,
	params: Record<string, unknown>,
) {
	let call = 0;
	const httpRequestWithAuthentication = vi.fn(async () => responses[call++]);

	const ctx = {
		getInputData: () => [{ json: {} }],
		getNodeParameter: (name: string, _itemIndex: number, fallback?: unknown) =>
			params[name] ?? fallback,
		continueOnFail: () => false,
		getNode: () => ({ name: 'RecentReborn' }),
		helpers: {
			httpRequestWithAuthentication,
		},
	} as unknown as IExecuteFunctions;

	return { ctx, httpRequestWithAuthentication };
}

describe('RecentReborn.execute (pagination)', () => {
	it('stops after the first page once "Limit" is reached, without needing "Return All"', async () => {
		const { ctx, httpRequestWithAuthentication } = makeExecuteContext(
			[{ results: [{ posted_at: '1' }, { posted_at: '2' }, { posted_at: '3' }] }],
			{ operation: 'searchHashtag', tag: 'coffee', feedType: 'posts', returnAll: false, limit: 2 },
		);

		const node = new RecentReborn();
		const [items] = await node.execute.call(ctx);

		expect(items).toHaveLength(2);
		expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(1);
	});

	it('keeps paginating past one page when "Return All" is off but "Limit" exceeds a single page', async () => {
		const { ctx, httpRequestWithAuthentication } = makeExecuteContext(
			[
				{ results: [{ posted_at: '1' }, { posted_at: '2' }], next_pagination_token: 'page2' },
				{ results: [{ posted_at: '3' }, { posted_at: '4' }] },
			],
			{ operation: 'searchHashtag', tag: 'coffee', feedType: 'posts', returnAll: false, limit: 4 },
		);

		const node = new RecentReborn();
		const [items] = await node.execute.call(ctx);

		expect(items).toHaveLength(4);
		expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(2);
	});

	it('follows every page when "Return All" is on, ignoring "Limit"', async () => {
		const { ctx, httpRequestWithAuthentication } = makeExecuteContext(
			[
				{ results: [{ posted_at: '1' }], next_pagination_token: 'page2' },
				{ results: [{ posted_at: '2' }], next_pagination_token: 'page3' },
				{ results: [{ posted_at: '3' }] },
			],
			{ operation: 'searchHashtag', tag: 'coffee', feedType: 'posts', returnAll: true, limit: 1 },
		);

		const node = new RecentReborn();
		const [items] = await node.execute.call(ctx);

		expect(items).toHaveLength(3);
		expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(3);
	});
});
