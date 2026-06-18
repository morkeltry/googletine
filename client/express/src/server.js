// Express server setup for googletine client

import express from 'express';
import 'path';
import cookieParser from 'cookie-parser';
import forwardRequest from './forwardRequest.js';
import { constants } from '../constants.js';

const server = express();
const { port } = constants;

server.set('port', process.env.GOOGLETINE_CLIENT_PORT || port);

// Middleware
server.use(express.json());
server.use(cookieParser());
server.use(express.urlencoded({ extended: true }));

// Request logging
server.use((req, res, next) => {
	console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
	next();
});

// Main route: forward requests to remote node
server.get('/request', forwardRequest.get);

// Transparent route: paste URL directly after /request/
server.get('/request/*', (req, res) => {
	// Extract URL from path (everything after /request/)
	const urlPath = req.path.substring(9); // Remove '/request/'
	const decodedUrl = decodeURIComponent(urlPath);

	// Mock request object with URL in query
	const mockReq = {
		...req,
		query: {
			url: decodedUrl,
			...req.query // Preserve any other query params like persona
		}
	};

	forwardRequest.get(mockReq, res);
});

// Health check
server.get('/health', (req, res) => {
	res.send({ status: 'ok', timestamp: Date.now() });
});

// Info endpoint
server.get('/', (req, res) => {
	res.send({
		name: 'Googletine Client',
		version: '1.0.0',
		status: 'running',
		endpoints: {
			request: 'GET /request?url=<encoded-url> or GET /request/<url>',
			request_with_persona: 'GET /request/<url>?persona=<id>',
			health: 'GET /health'
		},
		examples: [
			'GET /request/https://youtube.com/watch?v=123',
			'GET /request/youtube.com/watch?v=123',
			'GET /request?url=https://youtube.com/watch?v=123&persona=abc123'
		]
	});
});

export default server;
