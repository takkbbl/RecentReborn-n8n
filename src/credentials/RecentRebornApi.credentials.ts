import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class RecentRebornApi implements ICredentialType {
	name = 'recentRebornApi';

	displayName = 'RecentReborn API';

	icon = 'file:recentreborn.svg' as const;

	documentationUrl = 'https://recentreborn.com/api-docs';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Your RecentReborn API key (starts with "rr_live_"). Generate one from the API Key section of your RecentReborn dashboard. Sent as a bearer token, and calls made with it count against your normal daily search quota.',
		},
	];

	// RecentReborn expects "Authorization: Bearer <key>" on every request.
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	// A cheap, always-available call used by the "Test" button in the credential UI.
	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://app.recentreborn.com/api/v1',
			url: '/locations',
			qs: {
				query: 'Berlin, Germany',
			},
		},
	};
}
