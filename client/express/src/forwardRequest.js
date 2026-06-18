// Main request forwarder for googletine client
// Forwards browser requests to remote nodes and handles payment

import { doPayment } from '../../../shared/payments/stub.js';
import { isPaymentRequired, parsePaymentRequestHeaders, createPaymentHeaders } from '../../../shared/payments/headers.js';
import { loadYouTubePersonas, getNextYouTubePersona, isYouTubeUrl } from './personas.js';
import { constants } from '../constants.js';

const { googletineNodes } = constants;

// Local parameters that should be stripped before proxying
const LOCAL_PARAMS = ['persona', 'use_persona'];

// Headers to strip from response (identifying headers)
const STRIP_RESPONSE_HEADERS = ['etag', 'x-etag', 'if-match', 'if-none-match'];

// Get preferred remote node (simple round-robin for now)
let currentNodeIndex = 0;
const getRemoteNode = () => {
	const node = googletineNodes[currentNodeIndex];
	currentNodeIndex = (currentNodeIndex + 1) % googletineNodes.length;
	return node;
};

// Forward headers from fetch response to client response, stripping identifying headers
const forwardHeaders = (fetchResponse, clientResponse) => {
	fetchResponse.headers.forEach((value, key) => {
		const lowerKey = key.toLowerCase();
		if (!STRIP_RESPONSE_HEADERS.includes(lowerKey)) {
			clientResponse.setHeader(key, value);
		}
	});
};

// Build headers to forward to server, including browser's headers
const buildForwardHeaders = (req) => {
	const headers = {
		'X-Session-Id': `client-${Date.now()}`
	};

	// Forward browser's headers that should influence the destination response
	// These help the server appear as the requesting browser
	const browserHeadersToForward = [
		'accept',
		'accept-language',
		'accept-encoding',
		'user-agent',
		'dnt',
		'sec-fetch-dest',
		'sec-fetch-mode',
		'sec-fetch-site',
		'sec-fetch-user'
	];

	for (const headerName of browserHeadersToForward) {
		// Use req.get() to safely access headers (Express API)
		const value = req.get(headerName);
		if (value) {
			// Capitalize first letter of each word for HTTP header format
			const formattedName = headerName.split('-').map(word =>
				word.charAt(0).toUpperCase() + word.slice(1)
			).join('-');
			headers[formattedName] = value;
		}
	}

	return headers;
};

// Normalize URL - add https:// if missing
const normalizeUrl = (url) => {
	if (!url.startsWith('http://') && !url.startsWith('https://')) {
		return 'https://' + url;
	}
	return url;
};

// Strip local parameters from URL querystring
const stripLocalParams = (url) => {
	try {
		const urlObj = new URL(url);
		LOCAL_PARAMS.forEach(param => {
			urlObj.searchParams.delete(param);
		});
		return urlObj.toString();
	} catch (e) {
		return url;
	}
};

// Process request with payment retry logic
const processRequest = async (url, clientResponse, req, useGet = false) => {
	const remoteNode = getRemoteNode();
	const remoteUrl = `http://${remoteNode.nodeUrl}/request`;

	// Normalize URL
	const normalizedUrl = normalizeUrl(url);
	console.log(`Forwarding request to ${remoteUrl} for URL: ${normalizedUrl}`);

	// Extract local parameters from original request
	const personaParam = req.query.persona;
	const usePersonaParam = req.query.use_persona === 'true';

	try {
		let response;

		if (useGet) {
			// Forward as GET with querystring (transparent mode)
			// Build querystring with URL and local params
			const forwardParams = new URLSearchParams({ url: normalizedUrl });
			if (personaParam) {
				forwardParams.set('persona', personaParam);
			}
			if (usePersonaParam) {
				forwardParams.set('use_persona', 'true');
			}

			const forwardUrl = `${remoteUrl}?${forwardParams.toString()}`;
			console.log(`Forwarding as GET to: ${forwardUrl}`);

			response = await fetch(forwardUrl, {
				method: 'GET',
				headers: buildForwardHeaders(req)
			});
		} else {
			// Forward as POST (existing behavior)
			const requestBody = { url: normalizedUrl };
			if (usePersonaParam && isYouTubeUrl(normalizedUrl) && youtubePersonas.length > 0) {
				const persona = getNextYouTubePersona();
				if (persona) {
					requestBody.personaId = persona.id;
				}
			}

			response = await fetch(remoteUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...buildForwardHeaders(req)
				},
				body: JSON.stringify(requestBody)
			});
		}

		// Check if payment is required
		if (isPaymentRequired(response)) {
			console.log('Payment required - processing payment...');

			// Parse payment request from response
			const paymentRequest = parsePaymentRequestHeaders(response.headers);

			if (!paymentRequest) {
				console.error('Could not parse payment request');
				clientResponse.status(402).send({ error: 'Payment required but could not parse request' });
				return;
			}

			console.log('Payment request:', paymentRequest);

			// Execute payment
			const paymentResult = await doPayment(paymentRequest);

			if (!paymentResult.success) {
				console.error('Payment failed');
				clientResponse.status(402).send({ error: 'Payment failed' });
				return;
			}

			console.log('Payment successful:', paymentResult.transactionId);

			// Retry request with payment
			const paymentHeaders = createPaymentHeaders(paymentResult);
			const retryResponse = await fetch(remoteUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...buildForwardHeaders(req),
					...paymentHeaders
				},
				body: JSON.stringify({
					url: normalizedUrl,
					payment: paymentResult,
					personaId: personaParam
				})
			});

			if (!retryResponse.ok) {
				console.error('Retry failed with status:', retryResponse.status);
				clientResponse.status(retryResponse.status).send({ error: 'Failed after payment' });
				return;
			}

			// Stream successful response to browser
			const arrayBuffer = await retryResponse.arrayBuffer();

			// Forward all headers except identifying ones (ETag, etc.)
			forwardHeaders(retryResponse, clientResponse);

			clientResponse.status(200);
			clientResponse.send(Buffer.from(arrayBuffer));
			return;
		}

		// No payment required - stream response to browser
		if (response.ok) {
			const arrayBuffer = await response.arrayBuffer();

			// Forward all headers except identifying ones (ETag, etc.)
			forwardHeaders(response, clientResponse);

			clientResponse.status(response.status);
			clientResponse.send(Buffer.from(arrayBuffer));
		} else {
			clientResponse.status(response.status).send({ error: 'Request failed' });
		}

	} catch (err) {
		console.error('ERROR in processRequest:', err);
		clientResponse.status(500).send({ error: 'Internal error' });
	}
};

// Endpoint handler
const forwardRequest = {
	get: async (req, clientResponse) => {
		const { url } = req.query;

		if (!url) {
			clientResponse.status(400).send({ error: 'URL parameter is required' });
			return;
		}

		console.log(`Received GET request for URL: ${url}`);
		// Use GET forwarding for transparent mode
		await processRequest(url, clientResponse, req, true);
	}
};

export default forwardRequest;
