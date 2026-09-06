import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestOptions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes } from 'n8n-workflow';

const BASE_URL = 'https://app.recentreborn.com/api/v1';

type RecentRebornPost = {
	platform: 'instagram' | 'tiktok' | 'youtube';
	author: string;
	posted_at: string;
	caption: string | null;
	url: string;
	is_video: boolean;
	hashtags: string[];
	thumbnail_url: string | null;
	likes: number | null;
};

/**
 * Calls a RecentReborn GET endpoint, following next_pagination_token until
 * either there are no more pages or the requested item limit is reached.
 */
async function fetchAllPages(
	ctx: IExecuteFunctions,
	path: string,
	qs: Record<string, string | number | undefined>,
	returnAll: boolean,
	limit: number,
): Promise<RecentRebornPost[]> {
	const results: RecentRebornPost[] = [];
	let paginationToken: string | undefined;

	do {
		const query: Record<string, string | number> = {};
		for (const [key, value] of Object.entries(qs)) {
			if (value !== undefined && value !== '') query[key] = value;
		}
		if (paginationToken) query.pagination_token = paginationToken;

		const options: IHttpRequestOptions = {
			method: 'GET',
			url: `${BASE_URL}${path}`,
			qs: query,
			json: true,
		};

		const response = (await ctx.helpers.httpRequestWithAuthentication.call(
			ctx,
			'recentRebornApi',
			options,
		)) as { results?: RecentRebornPost[]; count?: number; next_pagination_token?: string };

		results.push(...(response.results ?? []));
		paginationToken = response.next_pagination_token;

		if (!returnAll && results.length >= limit) {
			return results.slice(0, limit);
		}
	} while (paginationToken && (returnAll || results.length < limit));

	return results;
}

export class RecentReborn implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'RecentReborn',
		name: 'recentReborn',
		icon: 'file:recentreborn.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description:
			'Chronological, real-time search across Instagram, TikTok, and YouTube. Search recent posts by hashtag, query, or location.',
		defaults: {
			name: 'RecentReborn',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'recentRebornApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				default: 'searchHashtag',
				options: [
					{
						name: 'Search Hashtag',
						value: 'searchHashtag',
						description: 'Search recent Instagram posts using a hashtag',
						action: 'Search recent instagram posts by hashtag',
					},
					{
						name: 'Search Query',
						value: 'searchQuery',
						description: 'Search recent TikTok or YouTube posts matching a free-text query',
						action: 'Search recent tiktok or youtube posts by query',
					},
					{
						name: 'Search Location',
						value: 'searchLocation',
						description: 'Search recent Instagram posts tagged at a location',
						action: 'Search recent instagram posts by location',
					},
					{
						name: 'Look Up Locations',
						value: 'lookupLocations',
						description: 'Find an Instagram location_id by name, for use with Search Location',
						action: 'Look up instagram locations by name',
					},
				],
			},

			// --- Search Hashtag ---
			{
				displayName: 'Hashtag',
				name: 'tag',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'coffee',
				description: 'Hashtag to search, without the # symbol',
				displayOptions: { show: { operation: ['searchHashtag'] } },
			},
			{
				displayName: 'Feed Type',
				name: 'feedType',
				type: 'options',
				default: 'posts',
				options: [
					{ name: 'Posts', value: 'posts' },
					{ name: 'Reels', value: 'reels' },
				],
				displayOptions: { show: { operation: ['searchHashtag'] } },
			},

			// --- Search Query ---
			{
				displayName: 'Query',
				name: 'q',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'matcha latte',
				description: 'Search term to match against captions and titles',
				displayOptions: { show: { operation: ['searchQuery'] } },
			},
			{
				displayName: 'Platform',
				name: 'platform',
				type: 'options',
				default: 'tiktok',
				options: [
					{ name: 'TikTok', value: 'tiktok' },
					{ name: 'YouTube', value: 'youtube' },
				],
				displayOptions: { show: { operation: ['searchQuery'] } },
			},
			{
				displayName: 'Upload Date',
				name: 'uploadDate',
				type: 'options',
				default: 'today',
				description:
					'How far back to look. YouTube only. The API defaults to "hour" if omitted, which is usually too narrow for a scheduled workflow.',
				options: [
					{ name: 'Past Hour', value: 'hour' },
					{ name: 'Today', value: 'today' },
					{ name: 'Past Week', value: 'week' },
					{ name: 'Past Month', value: 'month' },
					{ name: 'Past Year', value: 'year' },
				],
				displayOptions: { show: { operation: ['searchQuery'], platform: ['youtube'] } },
			},

			// --- Look Up Locations ---
			{
				displayName: 'Location Name',
				name: 'locationQuery',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'Berlin, Germany',
				description: 'Location name to search for, to find its location_id',
				displayOptions: { show: { operation: ['lookupLocations'] } },
			},

			// --- Search Location ---
			{
				displayName: 'Location ID',
				name: 'locationId',
				type: 'number',
				default: 0,
				required: true,
				description: 'Instagram location ID. Get this from the "Look Up Locations" operation first.',
				displayOptions: { show: { operation: ['searchLocation'] } },
			},

			// --- Shared pagination controls (search operations only) ---
			{
				displayName: 'Return All',
				name: 'returnAll',
				type: 'boolean',
				default: false,
				description: 'Whether to follow next_pagination_token and return all results, or stop at a limit',
				displayOptions: {
					show: { operation: ['searchHashtag', 'searchQuery', 'searchLocation'] },
				},
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				default: 50,
				typeOptions: { minValue: 1 },
				description: 'Max number of posts to return',
				displayOptions: {
					show: {
						operation: ['searchHashtag', 'searchQuery', 'searchLocation'],
						returnAll: [false],
					},
				},
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const operation = this.getNodeParameter('operation', 0) as string;

		for (let i = 0; i < items.length; i++) {
			try {
				if (operation === 'lookupLocations') {
					const query = this.getNodeParameter('locationQuery', i) as string;
					const options: IHttpRequestOptions = {
						method: 'GET',
						url: `${BASE_URL}/locations`,
						qs: { query },
						json: true,
					};
					const response = (await this.helpers.httpRequestWithAuthentication.call(
						this,
						'recentRebornApi',
						options,
					)) as { locations: Array<{ id: number; name: string }> };

					for (const location of response.locations ?? []) {
						returnData.push({ json: location as unknown as IDataObject, pairedItem: i });
					}
					continue;
				}

				const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;
				const limit = this.getNodeParameter('limit', i, 50) as number;

				let path: string;
				let qs: Record<string, string | number | undefined>;

				if (operation === 'searchHashtag') {
					path = '/search/hashtag';
					qs = {
						tag: this.getNodeParameter('tag', i) as string,
						feed_type: this.getNodeParameter('feedType', i) as string,
					};
				} else if (operation === 'searchQuery') {
					const platform = this.getNodeParameter('platform', i) as string;
					path = '/search/query';
					qs = {
						q: this.getNodeParameter('q', i) as string,
						platform,
						upload_date:
							platform === 'youtube' ? (this.getNodeParameter('uploadDate', i) as string) : undefined,
					};
				} else if (operation === 'searchLocation') {
					path = '/search/location';
					qs = {
						location_id: this.getNodeParameter('locationId', i) as number,
					};
				} else {
					throw new NodeApiError(this.getNode(), {
						message: `Unknown operation: ${operation}`,
					});
				}

				const posts = await fetchAllPages(this, path, qs, returnAll, limit);
				for (const post of posts) {
					returnData.push({ json: post as unknown as IDataObject, pairedItem: i });
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message }, pairedItem: i });
					continue;
				}
				throw new NodeApiError(this.getNode(), error as JsonObject);
			}
		}

		return [returnData];
	}
}
