import { describe, expect, it, vi } from 'vitest';
import type { IPollFunctions } from 'n8n-workflow';

import { RecentRebornTrigger } from './RecentRebornTrigger.node';

function makePollContext(
	results: Array<{ posted_at: string }>,
	staticData: { lastPostedAt?: string },
	mode: 'trigger' | 'manual' = 'trigger',
) {
	const httpRequestWithAuthentication = vi.fn(async () => ({ results }));

	const ctx = {
		getNodeParameter: (name: string) => {
			if (name === 'searchType') return 'hashtag';
			if (name === 'tag') return 'coffee';
			if (name === 'feedType') return 'posts';
			return undefined;
		},
		getWorkflowStaticData: () => staticData,
		getMode: () => mode,
		helpers: { httpRequestWithAuthentication },
	} as unknown as IPollFunctions;

	return ctx;
}

describe('RecentRebornTrigger.poll', () => {
	it('emits nothing on the very first poll (no "last seen" yet) in trigger mode', async () => {
		const staticData: { lastPostedAt?: string } = {};
		const ctx = makePollContext(
			[{ posted_at: '2024-01-02T00:00:00Z' }, { posted_at: '2024-01-01T00:00:00Z' }],
			staticData,
			'trigger',
		);

		const result = await new RecentRebornTrigger().poll.call(ctx);

		expect(result).toBeNull();
		// The newest post's timestamp should still be recorded for the next poll.
		expect(staticData.lastPostedAt).toBe('2024-01-02T00:00:00Z');
	});

	it('emits the current page on the first poll when run manually from the editor', async () => {
		const staticData: { lastPostedAt?: string } = {};
		const ctx = makePollContext(
			[{ posted_at: '2024-01-02T00:00:00Z' }, { posted_at: '2024-01-01T00:00:00Z' }],
			staticData,
			'manual',
		);

		const [items] = (await new RecentRebornTrigger().poll.call(ctx)) ?? [[]];

		expect(items).toHaveLength(2);
	});

	it('only emits posts newer than the last seen one, oldest-first', async () => {
		const staticData = { lastPostedAt: '2024-01-01T00:00:00Z' };
		const ctx = makePollContext(
			[
				{ posted_at: '2024-01-03T00:00:00Z' },
				{ posted_at: '2024-01-02T00:00:00Z' },
				{ posted_at: '2024-01-01T00:00:00Z' }, // already seen, must be excluded
			],
			staticData,
			'trigger',
		);

		const result = await new RecentRebornTrigger().poll.call(ctx);
		const [items] = result ?? [[]];

		expect(items.map((i) => (i.json as { posted_at: string }).posted_at)).toEqual([
			'2024-01-02T00:00:00Z',
			'2024-01-03T00:00:00Z',
		]);
		expect(staticData.lastPostedAt).toBe('2024-01-03T00:00:00Z');
	});

	it('returns null when there are no new posts since the last seen one', async () => {
		const staticData = { lastPostedAt: '2024-01-02T00:00:00Z' };
		const ctx = makePollContext([{ posted_at: '2024-01-01T00:00:00Z' }], staticData, 'trigger');

		const result = await new RecentRebornTrigger().poll.call(ctx);

		expect(result).toBeNull();
	});
});
