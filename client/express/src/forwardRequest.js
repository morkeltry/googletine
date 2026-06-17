// Main request forwarder for googletine client
// Forwards browser requests to remote nodes and handles payment

import { doPayment } from '../../../shared/payments/stub.js';
import { isPaymentRequired, parsePaymentRequestHeaders, createPaymentHeaders } from '../../../shared/payments/headers.js';
import { constants } from '../constants.js';

const { googletineNodes } = constants;

// Get preferred remote node (simple round-robin for now)
let currentNodeIndex = 0;
const getRemoteNode = () => {
	const node = googletineNodes[currentNodeIndex];
	currentNodeIndex = (currentNodeIndex + 1) % googletineNodes.length;
	return node;
};

// Process request with payment retry logic
const processRequest = async (url, clientResponse) => {
	const remoteNode = getRemoteNode();
	const remoteUrl = `http://${remoteNode.nodeUrl}/request`;

	console.log(`Forwarding request to ${remoteUrl} for URL: ${url}`);

	try {
		// First attempt: request without payment
		const response = await fetch(remoteUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Session-Id': `client-${Date.now()}`
			},
			body: JSON.stringify({ url })
		});

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
					'X-Session-Id': `client-${Date.now()}`,
					...paymentHeaders
				},
				body: JSON.stringify({
					url,
					payment: paymentResult
				})
			});

			if (!retryResponse.ok) {
				console.error('Retry failed with status:', retryResponse.status);
				clientResponse.status(retryResponse.status).send({ error: 'Failed after payment' });
				return;
			}

			// Stream successful response to browser
			const arrayBuffer = await retryResponse.arrayBuffer();
			clientResponse.status(200);
			clientResponse.send(Buffer.from(arrayBuffer));
			return;
		}

		// No payment required - stream response to browser
		if (response.ok) {
			const arrayBuffer = await response.arrayBuffer();
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

		console.log(`Received request for URL: ${url}`);
		await processRequest(url, clientResponse);
	}
};

export default forwardRequest;
