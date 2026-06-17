// Express server setup for googletine server

import express from 'express';
import 'path';
import cookieParser from 'cookie-parser';
import acceptPageRequest, { getStats, getPersonas, loadPersonasFromDatabase } from './acceptPageRequest.js';
import { openSession, getSession } from './openSession.js';
import { constants } from '../constants.js';

const server = express();
const { port } = constants;

server.set('port', process.env.GOOGLETINE_SERVER_PORT || port);

// Middleware
server.use(express.json());
server.use(cookieParser());
server.use(express.urlencoded({ extended: true }));

// Request logging
server.use((req, res, next) => {
	console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
	next();
});

// Routes
server.post('/request', acceptPageRequest.post);
server.get('/session', openSession.get);
server.get('/session/:sessionId', (req, res) => {
	const session = getSession(req.params.sessionId);
	if (session) {
		res.json(session);
	} else {
		res.status(404).send({ error: 'Session not found' });
	}
});

// Persona management endpoints
server.get('/personas/stats', getStats.get);
server.get('/personas', getPersonas.get);
server.post('/personas/reload', (req, res) => {
	loadPersonasFromDatabase();
	res.json({ message: 'Personas reloaded from database', timestamp: Date.now() });
});

// Health check
server.get('/health', (req, res) => {
	res.send({ status: 'ok', timestamp: Date.now() });
});

export default server;
