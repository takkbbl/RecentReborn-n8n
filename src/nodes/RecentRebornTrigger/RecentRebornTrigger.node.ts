import type {
	IDataObject,
	IHttpRequestOptions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IPollFunctions,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

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

export class RecentRebornTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'RecentReborn Trigger',
		name: 'recentRebornTrigger',
		icon: 'file:recentreborn.svg',
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["searchType"]}}',
		description:
			'Polls RecentReborn on a schedule and starts a workflow the moment a new hashtag, query, or location post appears',
		defaults: {
			name: 'RecentReborn Trigger',
		},
		polling: true,
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'recentRebornApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Search Type',
				name: 'searchType',
				type: 'options',
				noDataExpression: true,
				default: 'hashtag',
				options: [
					{ name: 'Hashtag (Instagram)', value: 'hashtag' },
					{ name: 'Query (TikTok / YouTube)', value: 'query' },
					{ name: 'Location (Instagram)', value: 'location' },
				],
			},
			{
				displayName: 'Hashtag',
				name: 'tag',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'coffee',
				description: 'Hashtag to watch, without the # symbol',
				displayOptions: { show: { searchType: ['hashtag'] } },
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
				displayOptions: { show: { searchType: ['hashtag'] } },
			},
			{
				displayName: 'Query',
				name: 'q',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'matcha latte',
				description: 'Search term to watch, matched against captions and titles',
				displayOptions: { show: { searchType: ['query'] } },
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
				displayOptions: { show: { searchType: ['query'] } },
			},
			{
				displayName: 'Upload Date',
				name: 'uploadDate',
				type: 'options',
				default: 'today',
				description:
					'How far back each poll looks on YouTube. Keep this wider than your polling interval so no post is missed between polls; the node still filters out anything it has already emitted.',
				options: [
					{ name: 'Past Hour', value: 'hour' },
					{ name: 'Today', value: 'today' },
					{ name: 'Past Week', value: 'week' },
				],
				displayOptions: { show: { searchType: ['query'], platform: ['youtube'] } },
			},
			{
				displayName: 'Location ID',
				name: 'locationId',
				type: 'number',
				default: 0,
				required: true,
				description:
					'Instagram location ID to watch. Use the RecentReborn node\'s "Look Up Locations" operation to find it.',
				displayOptions: { show: { searchType: ['location'] } },
			},
		],
	};

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const searchType = this.getNodeParameter('searchType') as string;

		let path: string;
		const qs: Record<string, string | number | undefined> = {};

		if (searchType === 'hashtag') {
			path = '/search/hashtag';
			qs.tag = this.getNodeParameter('tag') as string;
			qs.feed_type = this.getNodeParameter('feedType') as string;
		} else if (searchType === 'query') {
			const platform = this.getNodeParameter('platform') as string;
			path = '/search/query';
			qs.q = this.getNodeParameter('q') as string;
			qs.platform = platform;
			if (platform === 'youtube') {
				qs.upload_date = this.getNodeParameter('uploadDate') as string;
			}
		} else {
			path = '/search/location';
			qs.location_id = this.getNodeParameter('locationId') as number;
		}

		const options: IHttpRequestOptions = {
			method: 'GET',
			url: `${BASE_URL}${path}`,
			qs,
			json: true,
		};

		const response = (await this.helpers.httpRequestWithAuthentication.call(
			this,
			'recentRebornApi',
			options,
		)) as { results?: RecentRebornPost[] };

		// RecentReborn returns newest-first. Keep only posts newer than the last
		// one we've already emitted, then flip to chronological (oldest-first)
		// order so downstream nodes process them in the order they happened.
		const posts = response.results ?? [];
		const staticData = this.getWorkflowStaticData('node') as { lastPostedAt?: string };
		const lastPostedAt = staticData.lastPostedAt;

		const newPosts = lastPostedAt
			? posts.filter((post) => post.posted_at > lastPostedAt)
			: posts;

		if (posts.length > 0) {
			// posts[0] is the newest, since results come back newest-first.
			staticData.lastPostedAt = posts[0].posted_at;
		}

		// On the very first poll there's nothing to compare against yet, so
		// don't flood the workflow with everything that already exists. Emit
		// data only when the user is manually testing the node, so they can
		// see the shape of a real result.
		if (!lastPostedAt && this.getMode() !== 'manual') {
			return null;
		}

		if (newPosts.length === 0) {
			return null;
		}

		const ordered = [...newPosts].reverse();
		const returnData: INodeExecutionData[] = ordered.map((post) => ({
			json: post as unknown as IDataObject,
		}));

		return [returnData];
	}
}
