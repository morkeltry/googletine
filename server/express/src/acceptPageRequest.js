// Main request handler for googletine server
// Handles payment verification and request fulfillment with persona management

import { requestPayment, receivePayment } from '../../../shared/payments/stub.js';
import { createPaymentRequestHeaders, parsePaymentHeaders } from '../../../shared/payments/headers.js';
import { YouTubePersonaManager } from '../../../shared/providers/youtube.js';
import { constants } from '../constants.js';

const { siteCookies } = constants;

// Initialize YouTube persona manager
const youtubeManager = new YouTubePersonaManager({
	maxPersonas: 10,
	rotationStrategy: 'round-robin' // or 'random', 'least-recently-used'
});

// Modify response (placeholder for future functionality)
const modifyResponse = (response) => {
	return response;
};

// Generate fetch modifiers for cookie injection
const getFetchModifier = (url, persona) => {
	if (url.indexOf('medium.com') > -1) {
		return {
			headers: {
				cookie: siteCookies.medium.cookie
			}
		};
	}

	if (url.indexOf('twitter.com') > -1 || url.indexOf('x.com') > -1) {
		return {
			headers: {
				cookie: siteCookies.twitter.cookie
			}
		};
	}

	// For YouTube, use persona headers
	if (url.indexOf('youtube.com') > -1 && persona) {
		return {
			headers: persona.getRequestHeaders()
		};
	}

	return {};
};

// Process request and handle payment flow
const processRequest = async (req, res) => {
	const { url, payment } = req.body || {};
	const sessionId = req.headers['x-session-id'] || null;

	console.log(`Processing request for URL: ${url}`);

	if (!url) {
		res.status(400).send({ error: 'URL is required' });
		return;
	}

	// Step 1: Check if payment is provided
	if (!payment) {
		// No payment? Return 402 with payment request
		console.log('No payment provided - requesting payment');
		const paymentReq = requestPayment(url, sessionId);
		const headers = createPaymentRequestHeaders(paymentReq);

		res.status(402);
		Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value));
		res.send({
			error: 'Payment required',
			paymentRequest: paymentReq
		});
		return;
	}

	// Step 2: Validate payment
	console.log('Payment provided, validating...');
	const paymentResult = await receivePayment(payment);

	if (!paymentResult.valid) {
		console.log('Payment validation failed:', paymentResult.error);
		res.status(402).send({
			error: 'Payment invalid',
			details: paymentResult.error
		});
		return;
	}

	// Step 3: Payment valid - determine provider and get persona
	console.log('Payment valid - fetching URL:', url);

	try {
		const urlObj = new URL(url);
		const provider = urlObj.hostname;

		// Get or create appropriate persona
		let persona;
		let headers = {};

		if (provider.includes('youtube.com')) {
			persona = youtubeManager.getPersona();
			console.log(`Using YouTube persona: ${persona.id} (request #${persona.requestCount + 1})`);
			headers = persona.getRequestHeaders();
		} else {
			// For other providers, use basic headers
			headers = {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
				'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
				'Accept-Language': 'en-US,en;q=0.5',
				'DNT': '1',
				'Connection': 'keep-alive'
			};
		}

		// Add custom cookie injection if configured
		const fetchModifier = getFetchModifier(url, persona);
		headers = { ...headers, ...fetchModifier.headers };

		// Fetch the URL with persona headers
		const fullResponse = await fetch(url, { headers }).then(modifyResponse);

		// Update persona with response cookies
		if (persona) {
			youtubeManager.updatePersona(persona.id, fullResponse, provider);

			// Log persona status
			const cookieStatus = persona.getYouTubeCookieStatus();
			console.log('Persona cookie status:', {
				CONSENT: !!cookieStatus.CONSENT,
				VISITOR_INFO1_LIVE: !!cookieStatus.VISITOR_INFO1_LIVE,
				YSC: !!cookieStatus.YSC,
				totalCookies: persona.cookies.size
			});
		}

		// Stream response to client
		const arrayBuffer = await fullResponse.arrayBuffer();
		res.status(200);
		res.send(Buffer.from(arrayBuffer));

	} catch (err) {
		console.error('ERROR fetching URL:', err);
		res.status(500).send({ error: 'Failed to fetch URL' });
	}
};

// Endpoint handler
const acceptPageRequest = {
	post: async (req, res) => {
		try {
			await processRequest(req, res);
		} catch (err) {
			console.error('ERROR in acceptPageRequest:', err);
			res.status(500).send({ error: 'Internal server error' });
		}
	}
};

// Management endpoints for debugging/admin
const getStats = {
	get: async (req, res) => {
		const stats = youtubeManager.getYouTubeStats();
		res.json(stats);
	}
};

const getPersonas = {
	get: async (req, res) => {
		const personas = youtubeManager.getDetailedPersonaInfo();
		res.json(personas);
	}
};

export default acceptPageRequest;
export { getStats, getPersonas, youtubeManager };
