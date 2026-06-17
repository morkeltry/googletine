#!/usr/bin/env node
// Googletine CLI - Persona management interface

import { YouTubePersona, YouTubePersonaManager } from './shared/providers/youtube.js';
import { TwitterPersona, TwitterPersonaManager } from './shared/providers/twitter.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Persistent storage for personas (in server/data directory)
const STORAGE_FILE = join(__dirname, 'server/data', '.googletine-db.json');

// Load personas from storage
const loadPersonas = () => {
	if (existsSync(STORAGE_FILE)) {
		try {
			const data = JSON.parse(readFileSync(STORAGE_FILE, 'utf8'));
			return data.personas || [];
		} catch (err) {
			console.error('Error loading storage:', err.message);
			return [];
		}
	}
	return [];
};

// Save personas to storage
const savePersonas = (personas) => {
	const data = { personas, version: 1, lastSaved: Date.now() };
	writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2));
};

// Create a manager from stored personas
const createManagerFromStorage = (provider) => {
	const personas = loadPersonas();
	const providerPersonas = personas.filter(p => p.provider === provider);

	let manager;
	switch (provider) {
		case 'youtube':
			manager = new YouTubePersonaManager();
			break;
		case 'twitter':
			manager = new TwitterPersonaManager();
			break;
		default:
			console.error(`Unknown provider: ${provider}`);
			return null;
	}

	// Reconstruct personas from storage
	for (const personaData of providerPersonas) {
		let persona;
		switch (provider) {
			case 'youtube':
				persona = new YouTubePersona(personaData);
				break;
			case 'twitter':
				persona = new TwitterPersona(personaData);
				break;
			default:
				persona = new YouTubePersona(personaData); // fallback
		}
		manager.personas.set(persona.id, persona);
	}

	return manager;
};

// Save a manager's personas to storage
const saveManagerPersonas = (manager) => {
	// Get all existing personas
	let allPersonas = loadPersonas();

	// Remove personas for this provider
	const provider = manager.providerId;
	allPersonas = allPersonas.filter(p => p.provider !== provider);

	// Add current personas
	for (const persona of manager.personas.values()) {
		allPersonas.push({
			id: persona.id,
			provider: persona.provider,
			name: persona.name,
			createdAt: persona.createdAt,
			lastUsed: persona.lastUsed,
			requestCount: persona.requestCount,
			status: persona.status,
			cookies: Array.from(persona.cookies.entries()),
			state: persona.state
		});
	}

	savePersonas(allPersonas);
};

// Create a new persona by making a search request
const createPersona = async (provider, searchTerm, name) => {
	const manager = createManagerFromStorage(provider);
	if (!manager) {
		console.error(`Failed to get manager for provider: ${provider}`);
		return false;
	}

	console.log(`Creating ${provider} persona for search: "${searchTerm}"`);

	try {
		// Create a new persona
		const persona = manager.createPersona({
			name: name || searchTerm
		});

		// Determine search URL based on provider
		let searchUrl;
		switch (provider) {
			case 'youtube':
				searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchTerm)}`;
				break;
			case 'twitter':
				searchUrl = `https://twitter.com/search?q=${encodeURIComponent(searchTerm)}`;
				break;
			default:
				console.error(`No search URL configured for provider: ${provider}`);
				return false;
		}

		// Make the search request to initialize the persona's cookies
		console.log(`Fetching: ${searchUrl}`);

		const headers = persona.getRequestHeaders();
		const response = await fetch(searchUrl, { headers });

		if (!response.ok) {
			console.error(`Search failed: ${response.status} ${response.statusText}`);
			return false;
		}

		// Update persona with response cookies
		manager.updatePersona(persona.id, response, new URL(searchUrl).hostname);

		// Save updated personas
		saveManagerPersonas(manager);

		// Display results
		console.log(`\n✓ Persona created successfully!`);
		console.log(`  ID: ${persona.id}`);
		console.log(`  Name: ${name || searchTerm}`);
		console.log(`  Provider: ${provider}`);
		console.log(`  Cookies received: ${persona.cookies.size}`);

		// Show key cookies
		if (provider === 'youtube') {
			const cookieStatus = persona.getYouTubeCookieStatus();
			console.log(`  Key cookies:`);
			for (const [key, value] of Object.entries(cookieStatus)) {
				if (value) {
					const display = typeof value === 'string' ? value.substring(0, 30) + '...' : value;
					console.log(`    ${key}: ${display}`);
				}
			}
		}

		return true;

	} catch (err) {
		console.error(`Error creating persona: ${err.message}`);
		return false;
	}
};

// List all personas or a specific one
const listPersonas = (provider, personaId) => {
	const personas = loadPersonas();

	if (provider) {
		const providerPersonas = personas.filter(p => p.provider === provider);

		if (personaId) {
			// List specific persona
			const persona = providerPersonas.find(p => p.id === personaId);
			if (!persona) {
				console.error(`Persona not found: ${personaId}`);
				return;
			}

			console.log(`\nPersona Details:`);
			console.log(`  ID: ${persona.id}`);
			console.log(`  Provider: ${persona.provider}`);
			console.log(`  Name: ${persona.name || 'unnamed'}`);
			console.log(`  Status: ${persona.status}`);
			console.log(`  Created: ${new Date(persona.createdAt).toISOString()}`);
			console.log(`  Last Used: ${new Date(persona.lastUsed).toISOString()}`);
			console.log(`  Requests: ${persona.requestCount}`);
			console.log(`  Cookies: ${persona.cookies.length}`);

			// Show cookies
			if (persona.cookies.length > 0) {
				console.log(`\n  Cookies:`);
				for (const [key, cookie] of persona.cookies) {
					const value = cookie[1].value.substring(0, 40) + (cookie[1].value.length > 40 ? '...' : '');
					console.log(`    ${cookie[0]}: ${value}`);
				}
			}
		} else {
			// List all personas for provider
			if (providerPersonas.length === 0) {
				console.log(`No personas found for provider: ${provider}`);
				return;
			}

			console.log(`\nPersonas for ${provider} (${providerPersonas.length} total):\n`);

			for (const persona of providerPersonas) {
				console.log(`  ${persona.id}`);
				console.log(`    Name: ${persona.name || 'unnamed'}`);
				console.log(`    Status: ${persona.status}`);
				console.log(`    Created: ${new Date(persona.createdAt).toISOString()}`);
				console.log(`    Requests: ${persona.requestCount}`);
				console.log(`    Cookies: ${persona.cookies.length}`);
				console.log('');
			}
		}
	} else {
		// List all providers
		const providers = [...new Set(personas.map(p => p.provider))];

		if (providers.length === 0) {
			console.log('No personas found.');
			return;
		}

		console.log(`\nAll Providers (${providers.length} total):\n`);

		for (const prov of providers) {
			const provPersonas = personas.filter(p => p.provider === prov);
			console.log(`  ${prov}:`);
			console.log(`    Total Personas: ${provPersonas.length}`);
			const totalRequests = provPersonas.reduce((sum, p) => sum + (p.requestCount || 0), 0);
			console.log(`    Total Requests: ${totalRequests}`);
			console.log('');
		}
	}
};

// Delete a persona
const deletePersona = (provider, personaId) => {
	let allPersonas = loadPersonas();

	const personaIndex = allPersonas.findIndex(p => p.provider === provider && p.id === personaId);

	if (personaIndex === -1) {
		console.error(`Persona not found: ${personaId}`);
		return;
	}

	allPersonas.splice(personaIndex, 1);
	savePersonas(allPersonas);

	console.log(`✓ Deleted persona: ${personaId}`);
};

// Show stats
const showStats = (provider) => {
	const personas = loadPersonas();

	if (provider) {
		const providerPersonas = personas.filter(p => p.provider === provider);

		console.log(`\nStats for ${provider}:`);
		console.log(`  Total Personas: ${providerPersonas.length}`);
		console.log(`  Active Personas: ${providerPersonas.filter(p => p.status === 'active').length}`);
		console.log(`  Total Requests: ${providerPersonas.reduce((sum, p) => sum + (p.requestCount || 0), 0)}`);

		if (providerPersonas.length > 0) {
			console.log(`\n  Cookie Coverage:`);
			const cookieNames = ['CONSENT', 'VISITOR_INFO1_LIVE', 'YSC', '__Secure-YEC', '__Secure-YENID'];
			for (const name of cookieNames) {
				const count = providerPersonas.filter(p =>
					p.cookies.some(([key]) => key === name)
				).length;
				console.log(`    ${name}: ${count}/${providerPersonas.length}`);
			}
		}
	} else {
		const providers = [...new Set(personas.map(p => p.provider))];

		console.log(`\nOverall Stats:`);
		console.log(`  Total Personas: ${personas.length}`);
		console.log(`  Providers: ${providers.length}`);

		for (const prov of providers) {
			const provPersonas = personas.filter(p => p.provider === prov);
			console.log(`\n  ${prov}:`);
			console.log(`    Personas: ${provPersonas.length}`);
			console.log(`    Requests: ${provPersonas.reduce((sum, p) => sum + (p.requestCount || 0), 0)}`);
		}
	}
};

// Show help
const showHelp = () => {
	console.log(`
Googletine CLI - Persona Management

Commands:
  create <provider> <search-term> [name]
      Create a new persona by searching for the given term
      Provider: youtube, twitter
      Name: optional, defaults to search term

  list [provider] [persona-id]
      List personas. If provider is given, lists personas for that provider.
      If persona-id is also given, shows details for that specific persona.

  delete <provider> <persona-id>
      Delete a specific persona

  stats [provider]
      Show statistics. If provider is given, shows stats for that provider only.

  help
      Show this help message

Examples:
  npm run persona -- create youtube "pigs" "Pig Research"
  npm run persona -- list youtube
  npm run persona -- list youtube persona-1234567890-abc
  npm run persona -- delete youtube persona-1234567890-abc
  npm run persona -- stats youtube
`);
};

// Main CLI handler
const main = async () => {
	const args = process.argv.slice(2);

	if (args.length === 0) {
		showHelp();
		return;
	}

	const command = args[0].toLowerCase();

	switch (command) {
		case 'create':
			if (args.length < 3) {
				console.error('Usage: create <provider> <search-term> [name]');
				return;
			}
			await createPersona(args[1], args[2], args[3]);
			break;

		case 'list':
			listPersonas(args[1], args[2]);
			break;

		case 'delete':
			if (args.length < 3) {
				console.error('Usage: delete <provider> <persona-id>');
				return;
			}
			deletePersona(args[1], args[2]);
			break;

		case 'stats':
			showStats(args[1]);
			break;

		case 'help':
		case '--help':
		case '-h':
			showHelp();
			break;

		default:
			console.error(`Unknown command: ${command}`);
			showHelp();
	}
};

main().catch(err => {
	console.error('Error:', err);
	process.exit(1);
});
