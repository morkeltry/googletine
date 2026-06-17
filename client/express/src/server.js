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
			request: 'GET /request?url=<encoded-url>',
			health: 'GET /health'
		}
	});
});

export default server;
